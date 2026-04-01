import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DocumentVisibility(str, enum.Enum):
    public = "public"
    managers_devs = "managers_devs"
    managers_only = "managers_only"


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    approved = "approved"


class DocumentTaskLinkType(str, enum.Enum):
    manual = "manual"
    auto = "auto"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    epoch_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("epochs.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    visibility: Mapped[DocumentVisibility] = mapped_column(
        Enum(DocumentVisibility), nullable=False, default=DocumentVisibility.public
    )
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), nullable=False, default=DocumentStatus.draft
    )
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="documents")
    epoch: Mapped["Epoch | None"] = relationship("Epoch", back_populates="documents")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], back_populates="created_documents")
    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion", back_populates="document", cascade="all, delete-orphan",
        order_by="DocumentVersion.version_num"
    )
    task_links: Mapped[list["DocumentTaskLink"]] = relationship(
        "DocumentTaskLink", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentTaskLink(Base):
    __tablename__ = "document_task_links"

    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    citation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_type: Mapped[DocumentTaskLinkType] = mapped_column(
        Enum(DocumentTaskLinkType), nullable=False, default=DocumentTaskLinkType.manual
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="task_links")
    task: Mapped["Task"] = relationship("Task", back_populates="document_links")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    meeting_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="versions")
    created_by: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_id], back_populates="document_versions"
    )
    meeting: Mapped["Meeting | None"] = relationship("Meeting", back_populates="document_versions")
