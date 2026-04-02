import os
import re
import uuid
from pathlib import Path

from app.config import settings

# Разрешённые расширения вложений (можно расширить)
ALLOWED_EXTENSIONS = frozenset(
    {
        ".pdf",
        ".xml",
        ".txt",
        ".md",
        ".json",
        ".csv",
        ".yaml",
        ".yml",
        ".doc",
        ".docx",
        ".xlsx",
        ".pptx",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".zip",
        # HTML is allowed as downloadable attachment.
        # We serve it with `text/plain` on download to reduce script execution risk.
        ".html",
        ".htm",
    }
)


def safe_original_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    base = re.sub(r"[^\w.\- \u0400-\u04FF]", "_", base)
    return (base[:240] or "file").strip()


def attachment_dir(project_id: int, document_id: int) -> Path:
    return Path(settings.UPLOAD_DIR) / "documents" / str(project_id) / str(document_id)


def attachment_path(project_id: int, document_id: int, storage_key: str) -> Path:
    return attachment_dir(project_id, document_id) / storage_key


def ensure_upload_root() -> None:
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def write_attachment_file(
    project_id: int, document_id: int, original_filename: str, data: bytes
) -> tuple[str, int]:
    ensure_upload_root()
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"unsupported extension: {ext or '(none)'}")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise ValueError("file too large")
    storage_key = f"{uuid.uuid4().hex}{ext}"
    d = attachment_dir(project_id, document_id)
    d.mkdir(parents=True, exist_ok=True)
    path = d / storage_key
    path.write_bytes(data)
    return storage_key, len(data)


def delete_attachment_file(project_id: int, document_id: int, storage_key: str) -> None:
    p = attachment_path(project_id, document_id, storage_key)
    if p.is_file():
        p.unlink()
    try:
        d = p.parent
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    except OSError:
        pass
