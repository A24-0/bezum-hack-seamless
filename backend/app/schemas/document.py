from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.document import DocumentVisibility, DocumentStatus, DocumentTaskLinkType


class DocumentBase(BaseModel):
    title: str
    content: dict[str, Any] = {}
    visibility: DocumentVisibility = DocumentVisibility.public
    status: DocumentStatus = DocumentStatus.draft
    epoch_id: int | None = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: dict[str, Any] | None = None
    visibility: DocumentVisibility | None = None
    status: DocumentStatus | None = None
    epoch_id: int | None = None


class DocumentRead(DocumentBase):
    id: int
    project_id: int
    current_version: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionCreate(BaseModel):
    content: dict[str, Any]
    change_summary: str | None = None
    meeting_id: int | None = None


class DocumentVersionRead(BaseModel):
    id: int
    document_id: int
    version_num: int
    content: dict[str, Any]
    created_by_id: int
    created_at: datetime
    change_summary: str | None
    meeting_id: int | None

    model_config = {"from_attributes": True}


class DocumentTaskLinkCreate(BaseModel):
    task_id: int
    citation_text: str | None = None
    link_type: DocumentTaskLinkType = DocumentTaskLinkType.manual


class DocumentTaskLinkRead(BaseModel):
    document_id: int
    task_id: int
    citation_text: str | None
    link_type: DocumentTaskLinkType

    model_config = {"from_attributes": True}


class LinkedTaskRead(BaseModel):
    task_id: int
    task_title: str
    task_status: str
    citation_text: str | None
    link_type: DocumentTaskLinkType
