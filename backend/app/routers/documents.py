import re
import uuid
from pathlib import Path
import difflib
from html import unescape as html_unescape

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, ProjectMemberRole, ProjectMember
from app.models.document import (
    Document,
    DocumentAttachment,
    DocumentTaskLink,
    DocumentVersion,
    DocumentVisibility,
    DocumentStatus,
    DocumentTaskLinkType,
    DocumentApproval,
    DocumentApprovalDecision,
)
from app.models.task import Task
from app.models.meeting import Meeting
from app.models.notification import NotificationType
from app.schemas.document import (
    DocumentCreate,
    DocumentUpdate,
    DocumentApprovalCreate,
)
from app.services.auth import get_current_user
from app.services.notification import create_notification, notify_many
from app.services.storage import (
    delete_attachment_file,
    ensure_upload_root,
    attachment_dir,
    ALLOWED_EXTENSIONS,
    safe_original_filename,
    write_attachment_file,
    attachment_path,
)
from app.config import settings
from app.utils.permissions import require_project_access, require_manager_or_developer, can_view_document

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


def _doc_dict(doc: Document) -> dict:
    created_by = None
    if hasattr(doc, 'created_by') and doc.created_by:
        created_by = {"id": doc.created_by.id, "name": doc.created_by.name, "email": doc.created_by.email, "role": doc.created_by.role}
    attachments = []
    atts = getattr(doc, "attachments", None)
    if atts is not None:
        for a in atts:
            attachments.append(
                {
                    "id": a.id,
                    "original_filename": a.original_filename,
                    "mime_type": a.mime_type,
                    "size_bytes": a.size_bytes,
                    "created_at": a.created_at,
                }
            )
    return {
        "id": doc.id,
        "project_id": doc.project_id,
        "epoch_id": doc.epoch_id,
        "title": doc.title,
        "content": doc.content,
        "visibility": doc.visibility,
        "status": doc.status,
        "current_version": doc.current_version,
        "created_by": created_by,
        "created_by_id": doc.created_by_id,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "attachments": attachments,
    }


def _extract_task_mentions(content: dict) -> list[int]:
    """Scan TipTap JSON content for #123 task mentions."""
    text = str(content)
    matches = re.findall(r'#(\d+)', text)
    return [int(m) for m in set(matches)]


def _tiptap_plain_text(node: object) -> str:
    """Best-effort plain text extraction from TipTap JSON."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, (int, float, bool)):
        return str(node)
    if isinstance(node, list):
        return "\n".join(_tiptap_plain_text(n) for n in node if n is not None).strip()
    if isinstance(node, dict):
        if node.get("type") == "text":
            return str(node.get("text") or "")
        parts = []
        if "content" in node and isinstance(node["content"], list):
            parts.append(_tiptap_plain_text(node["content"]))
        return "\n".join(p for p in parts if p).strip()
    return ""


async def _required_approver_ids(db: AsyncSession, project_id: int) -> set[int]:
    res = await db.execute(
        select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.role.in_([ProjectMemberRole.manager, ProjectMemberRole.developer]),
        )
    )
    return {r[0] for r in res.fetchall()}


async def _refresh_doc_status_from_approvals(db: AsyncSession, doc: Document) -> None:
    required = await _required_approver_ids(db, doc.project_id)
    if not required:
        return
    res = await db.execute(
        select(DocumentApproval).where(
            DocumentApproval.document_id == doc.id,
            DocumentApproval.version_num == doc.current_version,
            DocumentApproval.user_id.in_(list(required)),
        )
    )
    approvals = res.scalars().all()
    decisions = {a.user_id: a.decision for a in approvals}
    if any(d == DocumentApprovalDecision.rejected for d in decisions.values()):
        doc.status = DocumentStatus.draft
        return
    if required.issubset(set(decisions.keys())) and all(
        decisions[uid] == DocumentApprovalDecision.approved for uid in required
    ):
        doc.status = DocumentStatus.approved


@router.get("")
async def list_documents(
    project_id: int,
    epoch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await require_project_access(db, project_id, current_user)
    query = (
        select(Document)
        .options(selectinload(Document.created_by), selectinload(Document.attachments))
        .where(Document.project_id == project_id)
    )
    if epoch_id:
        query = query.where(Document.epoch_id == epoch_id)
    result = await db.execute(query)
    docs = result.scalars().all()
    return [_doc_dict(d) for d in docs if can_view_document(member.role, d.visibility)]


@router.post("", status_code=201)
async def create_document(
    project_id: int,
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    doc = Document(project_id=project_id, created_by_id=current_user.id, **data.model_dump())
    db.add(doc)
    await db.flush()
    # Save initial version
    version = DocumentVersion(
        document_id=doc.id,
        version_num=1,
        content=doc.content,
        created_by_id=current_user.id,
        change_summary="Initial version",
    )
    db.add(version)
    await db.flush()
    await db.refresh(doc)
    await db.refresh(doc, ["created_by", "attachments"])
    return _doc_dict(doc)


@router.get("/{doc_id}")
async def get_document(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Document).options(selectinload(Document.created_by), selectinload(Document.attachments))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not can_view_document(member.role, doc.visibility):
        raise HTTPException(403, "Access denied")
    return _doc_dict(doc)


@router.get("/{doc_id}/export-plain")
async def export_document_plain(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Текстовый экспорт содержимого редактора (TipTap) для скачивания как «реальный» текст."""
    member = await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not can_view_document(member.role, doc.visibility):
        raise HTTPException(403, "Access denied")
    text = _tiptap_plain_text(doc.content)
    safe_title = re.sub(r"[^\w\-_.]", "_", doc.title)[:80] or "document"
    return PlainTextResponse(
        text or "",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.txt"'},
    )


@router.post("/{doc_id}/attachments", status_code=201)
async def upload_attachment(
    project_id: int,
    doc_id: int,
    request: Request,
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)

    # Be tolerant to malformed multipart requests from the frontend.
    # If FastAPI couldn't parse `file` -> try to read from request.form().
    if file is None:
        try:
            form = await request.form()
            candidate = form.get("file")
            if isinstance(candidate, UploadFile):
                file = candidate
            else:
                # Fallback: pick the first UploadFile field (if any)
                for v in form.values():
                    if isinstance(v, UploadFile):
                        file = v
                        break
        except Exception:
            # Most common reason: frontend sends wrong Content-Type (not multipart/form-data).
            raise HTTPException(400, "Invalid upload request: expected multipart/form-data with field `file`.")

    if file is None:
        raise HTTPException(400, "No file uploaded. Expected multipart/form-data with field `file`.")
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    raw_name = safe_original_filename(file.filename or "file")

    # Stream upload to disk (avoid buffering the whole file in memory).
    ensure_upload_root()
    ext = Path(raw_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"unsupported extension: {ext or '(none)'}")

    # For document analysis we need `document.content`.
    # We only try to extract text for text-like formats to avoid heavy parsing.
    text_like_exts = {".txt", ".md", ".json", ".csv", ".yaml", ".yml", ".xml", ".html", ".htm"}
    should_parse_text = ext in text_like_exts
    text_buf = bytearray()
    max_parse_bytes = min(settings.MAX_UPLOAD_BYTES, 10 * 1024 * 1024)  # cap memory usage

    storage_key = f"{uuid.uuid4().hex}{ext}"
    d = attachment_dir(project_id, doc_id)
    d.mkdir(parents=True, exist_ok=True)
    path = d / storage_key

    chunk_size = 1024 * 1024
    total = 0
    try:
        with path.open("wb") as out:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > settings.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "File too large")
                out.write(chunk)
                if should_parse_text and len(text_buf) < max_parse_bytes:
                    need = max_parse_bytes - len(text_buf)
                    text_buf.extend(chunk[:need])
    except HTTPException:
        if path.exists():
            path.unlink(missing_ok=True)
        raise

    if total <= 0:
        if path.exists():
            path.unlink(missing_ok=True)
        raise HTTPException(400, "Empty file")

    size_b = total
    mime = file.content_type or "application/octet-stream"
    att = DocumentAttachment(
        document_id=doc_id,
        storage_key=storage_key,
        original_filename=raw_name,
        mime_type=mime[:250],
        size_bytes=size_b,
        created_by_id=current_user.id,
    )
    db.add(att)
    await db.flush()
    await db.refresh(att)

    # If this looks like a text document, also hydrate TipTap content.
    if should_parse_text and len(text_buf) > 0:
        decoded_text: str = ""
        try:
            decoded_text = text_buf.decode("utf-8")
        except UnicodeDecodeError:
            decoded_text = text_buf.decode("latin-1", errors="ignore")

        if decoded_text.strip():
            if ext in {".html", ".htm"}:
                # Very lightweight HTML stripping to reduce risk.
                decoded_text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", decoded_text)
                decoded_text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", decoded_text)
                decoded_text = re.sub(r"(?is)<[^>]+>", " ", decoded_text)
                decoded_text = html_unescape(decoded_text)

            decoded_text = decoded_text.replace("\r\n", "\n").replace("\r", "\n").strip()
            paragraphs = [p.strip() for p in re.split(r"\n{2,}", decoded_text) if p.strip()]
            if not paragraphs:
                paragraphs = [decoded_text.strip()]

            tiptap_content = {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": p}]}
                    for p in paragraphs
                ],
            }

            new_version_num = doc.current_version + 1
            version = DocumentVersion(
                document_id=doc_id,
                version_num=new_version_num,
                content=tiptap_content,
                created_by_id=current_user.id,
                change_summary=f"Imported from attachment: {raw_name}",
                meeting_id=None,
            )
            db.add(version)
            doc.content = tiptap_content
            doc.current_version = new_version_num
            doc.status = DocumentStatus.pending_review

            await db.flush()

    return {
        "id": att.id,
        "document_id": doc_id,
        "original_filename": att.original_filename,
        "mime_type": att.mime_type,
        "size_bytes": att.size_bytes,
        "created_at": att.created_at,
    }


@router.api_route("/{doc_id}/attachments/{attachment_id}/download", methods=["GET", "HEAD"])
async def download_attachment(
    project_id: int,
    doc_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await require_project_access(db, project_id, current_user)
    doc_res = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not can_view_document(member.role, doc.visibility):
        raise HTTPException(403, "Access denied")
    att_res = await db.execute(
        select(DocumentAttachment).where(
            DocumentAttachment.id == attachment_id,
            DocumentAttachment.document_id == doc_id,
        )
    )
    att = att_res.scalar_one_or_none()
    if not att:
        raise HTTPException(404, "Attachment not found")
    path = attachment_path(project_id, doc_id, att.storage_key)
    if not path.is_file():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(
        path,
        # If the user uploads HTML, serve it as plain text to prevent script execution.
        media_type=(
            "text/plain"
            if (att.original_filename or "").lower().endswith((".html", ".htm"))
            else att.mime_type
        ),
        filename=att.original_filename,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/{doc_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    project_id: int,
    doc_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    att_res = await db.execute(
        select(DocumentAttachment).where(
            DocumentAttachment.id == attachment_id,
            DocumentAttachment.document_id == doc_id,
        )
    )
    att = att_res.scalar_one_or_none()
    if not att:
        raise HTTPException(404, "Attachment not found")
    delete_attachment_file(project_id, doc_id, att.storage_key)
    await db.delete(att)


@router.put("/{doc_id}")
async def update_document(
    project_id: int,
    doc_id: int,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Document).options(selectinload(Document.created_by), selectinload(Document.attachments))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, val)
    await db.flush()
    await db.refresh(doc)
    await db.refresh(doc, ["created_by", "attachments"])
    return _doc_dict(doc)


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Document).options(selectinload(Document.attachments)).where(
            Document.id == doc_id, Document.project_id == project_id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    for a in doc.attachments or []:
        delete_attachment_file(project_id, doc_id, a.storage_key)
    await db.delete(doc)


@router.post("/{doc_id}/versions", status_code=201)
async def save_version(
    project_id: int,
    doc_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Document).options(selectinload(Document.created_by), selectinload(Document.task_links))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")

    new_version = doc.current_version + 1
    content = data.get("content", doc.content)
    change_summary = data.get("change_summary", "")
    meeting_id = data.get("meeting_id")

    version = DocumentVersion(
        document_id=doc.id,
        version_num=new_version,
        content=content,
        created_by_id=current_user.id,
        change_summary=change_summary,
        meeting_id=meeting_id,
    )
    db.add(version)
    doc.content = content
    doc.current_version = new_version
    doc.status = DocumentStatus.pending_review

    # Auto-detect task mentions
    mentioned_task_ids = _extract_task_mentions(content)
    existing_links = {link.task_id for link in doc.task_links}
    for task_id in mentioned_task_ids:
        if task_id not in existing_links:
            task_check = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
            if task_check.scalar_one_or_none():
                db.add(DocumentTaskLink(document_id=doc.id, task_id=task_id, link_type=DocumentTaskLinkType.auto))

    await db.flush()
    await db.refresh(version, ["created_by"])

    # Notify linked task watchers
    task_ids = [link.task_id for link in doc.task_links]
    if task_ids:
        from sqlalchemy.orm import selectinload as sil
        from app.models.task import TaskWatcher
        watchers_res = await db.execute(select(TaskWatcher.user_id).where(TaskWatcher.task_id.in_(task_ids)))
        watcher_ids = [r[0] for r in watchers_res.fetchall() if r[0] != current_user.id]
        await notify_many(db, watcher_ids, NotificationType.document_updated, f"Document updated: {doc.title}", change_summary or f"Version {new_version} saved", "document", str(doc.id))

    return {
        "id": version.id,
        "document_id": version.document_id,
        "version_num": version.version_num,
        "content": version.content,
        "change_summary": version.change_summary,
        "created_at": version.created_at,
        "created_by": {"id": current_user.id, "name": current_user.name, "email": current_user.email, "role": current_user.role},
    }


@router.get("/{doc_id}/versions")
async def list_versions(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(DocumentVersion).options(selectinload(DocumentVersion.created_by))
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_num.desc())
    )
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "document_id": v.document_id,
            "version_num": v.version_num,
            "content": v.content,
            "change_summary": v.change_summary,
            "created_at": v.created_at,
            "meeting_id": v.meeting_id,
            "created_by": {"id": v.created_by.id, "name": v.created_by.name} if v.created_by else None,
        }
        for v in versions
    ]


@router.post("/{doc_id}/versions/{version_id}/restore")
async def restore_version(
    project_id: int,
    doc_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    version_result = await db.execute(select(DocumentVersion).where(DocumentVersion.id == version_id, DocumentVersion.document_id == doc_id))
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Version not found")
    doc_result = await db.execute(select(Document).options(selectinload(Document.created_by)).where(Document.id == doc_id))
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    new_version_num = doc.current_version + 1
    new_version = DocumentVersion(
        document_id=doc.id,
        version_num=new_version_num,
        content=version.content,
        created_by_id=current_user.id,
        change_summary=f"Restored from version {version.version_num}",
    )
    db.add(new_version)
    doc.content = version.content
    doc.current_version = new_version_num
    await db.flush()
    await db.refresh(doc)
    await db.refresh(doc, ["created_by"])
    return _doc_dict(doc)


@router.post("/{doc_id}/approve")
async def approve_document(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.utils.permissions import require_manager
    await require_manager(db, project_id, current_user)
    result = await db.execute(select(Document).options(selectinload(Document.created_by)).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.status = DocumentStatus.approved
    await db.flush()
    await db.refresh(doc)
    await db.refresh(doc, ["created_by"])
    return _doc_dict(doc)


@router.get("/{doc_id}/meetings")
async def document_meetings(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    meeting_ids_res = await db.execute(
        select(DocumentVersion.meeting_id)
        .join(Document, Document.id == DocumentVersion.document_id)
        .where(Document.id == doc_id, Document.project_id == project_id, DocumentVersion.meeting_id.isnot(None))
        .distinct()
    )
    meeting_ids = [r[0] for r in meeting_ids_res.fetchall() if r[0] is not None]
    if not meeting_ids:
        return []
    meetings_res = await db.execute(select(Meeting).where(Meeting.id.in_(meeting_ids)))
    meetings = meetings_res.scalars().all()
    return [{"id": m.id, "title": m.title, "summary": m.summary, "scheduled_at": m.scheduled_at} for m in meetings]


@router.get("/{doc_id}/versions/diff")
async def diff_versions(
    project_id: int,
    doc_id: int,
    from_version: int,
    to_version: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    doc_res = await db.execute(select(Document).where(Document.id == doc_id, Document.project_id == project_id))
    if not doc_res.scalar_one_or_none():
        raise HTTPException(404, "Document not found")

    v_res = await db.execute(
        select(DocumentVersion)
        .where(
            DocumentVersion.document_id == doc_id,
            DocumentVersion.version_num.in_([from_version, to_version]),
        )
    )
    versions = {v.version_num: v for v in v_res.scalars().all()}
    if from_version not in versions or to_version not in versions:
        raise HTTPException(404, "One or both versions not found")

    a_text = _tiptap_plain_text(versions[from_version].content).splitlines(keepends=True)
    b_text = _tiptap_plain_text(versions[to_version].content).splitlines(keepends=True)
    diff = difflib.unified_diff(
        a_text,
        b_text,
        fromfile=f"v{from_version}",
        tofile=f"v{to_version}",
        lineterm="",
    )
    return {"from_version": from_version, "to_version": to_version, "unified_diff": "\n".join(diff)}


@router.get("/{doc_id}/approvals")
async def list_approvals(
    project_id: int,
    doc_id: int,
    version_num: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    doc_res = await db.execute(select(Document).where(Document.id == doc_id, Document.project_id == project_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    v = version_num or doc.current_version
    res = await db.execute(
        select(DocumentApproval)
        .where(DocumentApproval.document_id == doc_id, DocumentApproval.version_num == v)
        .order_by(DocumentApproval.created_at.desc())
    )
    approvals = res.scalars().all()
    return [
        {
            "id": a.id,
            "document_id": a.document_id,
            "version_num": a.version_num,
            "user_id": a.user_id,
            "decision": a.decision,
            "created_at": a.created_at,
        }
        for a in approvals
    ]


@router.post("/{doc_id}/approvals", status_code=201)
async def set_approval(
    project_id: int,
    doc_id: int,
    data: DocumentApprovalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    doc_res = await db.execute(select(Document).where(Document.id == doc_id, Document.project_id == project_id))
    doc = doc_res.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")

    version_num = data.version_num or doc.current_version
    existing_res = await db.execute(
        select(DocumentApproval).where(
            DocumentApproval.document_id == doc_id,
            DocumentApproval.version_num == version_num,
            DocumentApproval.user_id == current_user.id,
        )
    )
    existing = existing_res.scalar_one_or_none()
    if existing:
        existing.decision = data.decision
    else:
        db.add(
            DocumentApproval(
                document_id=doc_id,
                version_num=version_num,
                user_id=current_user.id,
                decision=data.decision,
            )
        )

    await _refresh_doc_status_from_approvals(db, doc)
    await db.flush()
    return {"document_id": doc_id, "version_num": version_num, "user_id": current_user.id, "decision": data.decision, "status": doc.status}

@router.get("/{doc_id}/tasks")
async def document_tasks(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Task).join(DocumentTaskLink, DocumentTaskLink.task_id == Task.id)
        .options(selectinload(Task.assignee))
        .where(DocumentTaskLink.document_id == doc_id)
    )
    tasks = result.scalars().all()
    return [{"id": t.id, "title": t.title, "status": t.status, "assignee": {"id": t.assignee.id, "name": t.assignee.name} if t.assignee else None} for t in tasks]


@router.post("/{doc_id}/tasks/{task_id}", status_code=201)
async def link_task(
    project_id: int,
    doc_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    existing = await db.execute(select(DocumentTaskLink).where(DocumentTaskLink.document_id == doc_id, DocumentTaskLink.task_id == task_id))
    if not existing.scalar_one_or_none():
        db.add(DocumentTaskLink(document_id=doc_id, task_id=task_id, link_type=DocumentTaskLinkType.manual))
        await db.flush()
    return {"document_id": doc_id, "task_id": task_id}


@router.delete("/{doc_id}/tasks/{task_id}", status_code=204)
async def unlink_task(
    project_id: int,
    doc_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(DocumentTaskLink).where(DocumentTaskLink.document_id == doc_id, DocumentTaskLink.task_id == task_id))
    link = result.scalar_one_or_none()
    if link:
        await db.delete(link)
