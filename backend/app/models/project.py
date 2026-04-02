import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProjectStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), nullable=False, default=ProjectStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    gitlab_repo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    gitlab_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Relationships
    members: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember", back_populates="project", cascade="all, delete-orphan"
    )
    epochs: Mapped[list["Epoch"]] = relationship(
        "Epoch", back_populates="project", cascade="all, delete-orphan", order_by="Epoch.order_index"
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="project", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="project", cascade="all, delete-orphan"
    )
    meetings: Mapped[list["Meeting"]] = relationship(
        "Meeting", back_populates="project", cascade="all, delete-orphan"
    )
    pull_requests: Mapped[list["PullRequest"]] = relationship(
        "PullRequest", back_populates="project", cascade="all, delete-orphan"
    )


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    epoch_id: Mapped[int] = mapped_column(Integer, ForeignKey("epochs.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    epoch: Mapped["Epoch"] = relationship("Epoch", back_populates="releases")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id], back_populates="releases_created")
