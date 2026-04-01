import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, ProjectMemberRole
from app.models.document import Document, DocumentTaskLink, DocumentVersion, DocumentVisibility, DocumentStatus, DocumentTaskLinkType
from app.models.task import Task
from app.models.notification import NotificationType
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.services.auth import get_current_user
from app.services.notification import create_notification, notify_many
from app.utils.permissions import require_project_access, require_manager_or_developer, can_view_document

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


def _doc_dict(doc: Document) -> dict:
    created_by = None
    if hasattr(doc, 'created_by') and doc.created_by:
        created_by = {"id": doc.created_by.id, "name": doc.created_by.name, "email": doc.created_by.email, "role": doc.created_by.role}
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
    }


def _extract_task_mentions(content: dict) -> list[int]:
    """Scan TipTap JSON content for #123 task mentions."""
    text = str(content)
    matches = re.findall(r'#(\d+)', text)
    return [int(m) for m in set(matches)]


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
        .options(selectinload(Document.created_by))
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
    await db.refresh(doc, ["created_by"])
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
        select(Document).options(selectinload(Document.created_by))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not can_view_document(member.role, doc.visibility):
        raise HTTPException(403, "Access denied")
    return _doc_dict(doc)


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
        select(Document).options(selectinload(Document.created_by))
        .where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, val)
    await db.flush()
    return _doc_dict(doc)


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    project_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.project_id == project_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
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
    return _doc_dict(doc)


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
