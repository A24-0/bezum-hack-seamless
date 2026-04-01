import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    manager = "manager"
    developer = "developer"
    customer = "customer"


class ProjectMemberRole(str, enum.Enum):
    manager = "manager"
    developer = "developer"
    customer = "customer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.developer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    project_memberships: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember", back_populates="user", cascade="all, delete-orphan"
    )
    assigned_tasks: Mapped[list["Task"]] = relationship(
        "Task", foreign_keys="Task.assignee_id", back_populates="assignee"
    )
    reported_tasks: Mapped[list["Task"]] = relationship(
        "Task", foreign_keys="Task.reporter_id", back_populates="reporter"
    )
    watched_tasks: Mapped[list["TaskWatcher"]] = relationship(
        "TaskWatcher", back_populates="user", cascade="all, delete-orphan"
    )
    created_documents: Mapped[list["Document"]] = relationship(
        "Document", foreign_keys="Document.created_by_id", back_populates="created_by"
    )
    document_versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion", foreign_keys="DocumentVersion.created_by_id", back_populates="created_by"
    )
    meetings_created: Mapped[list["Meeting"]] = relationship(
        "Meeting", foreign_keys="Meeting.created_by_id", back_populates="created_by"
    )
    meeting_participations: Mapped[list["MeetingParticipant"]] = relationship(
        "MeetingParticipant", back_populates="user", cascade="all, delete-orphan"
    )
    meeting_proposals: Mapped[list["MeetingTimeProposal"]] = relationship(
        "MeetingTimeProposal", back_populates="proposed_by"
    )
    pull_requests: Mapped[list["PullRequest"]] = relationship(
        "PullRequest", foreign_keys="PullRequest.author_id", back_populates="author"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan"
    )
    releases_created: Mapped[list["Release"]] = relationship(
        "Release", foreign_keys="Release.created_by_id", back_populates="created_by"
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[ProjectMemberRole] = mapped_column(
        Enum(ProjectMemberRole), nullable=False, default=ProjectMemberRole.developer
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="project_memberships")
