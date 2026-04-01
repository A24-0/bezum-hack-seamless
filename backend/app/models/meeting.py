import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MeetingStatus(str, enum.Enum):
    scheduling = "scheduling"
    scheduled = "scheduled"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class MeetingParticipantStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    epoch_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("epochs.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus), nullable=False, default=MeetingStatus.scheduling
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    jitsi_room_id: Mapped[str] = mapped_column(String(255), nullable=False)
    recording_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="meetings")
    epoch: Mapped["Epoch | None"] = relationship("Epoch", back_populates="meetings")
    spawned_from_task: Mapped["Task | None"] = relationship("Task", back_populates="meetings")
    created_by: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_id], back_populates="meetings_created"
    )
    participants: Mapped[list["MeetingParticipant"]] = relationship(
        "MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan"
    )
    time_proposals: Mapped[list["MeetingTimeProposal"]] = relationship(
        "MeetingTimeProposal", back_populates="meeting", cascade="all, delete-orphan"
    )
    document_versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion", back_populates="meeting"
    )


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[MeetingParticipantStatus] = mapped_column(
        Enum(MeetingParticipantStatus), nullable=False, default=MeetingParticipantStatus.pending
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="participants")
    user: Mapped["User"] = relationship("User", back_populates="meeting_participations")


class MeetingTimeProposal(Base):
    __tablename__ = "meeting_time_proposals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    proposed_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    proposed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    votes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="time_proposals")
    proposed_by: Mapped["User"] = relationship("User", back_populates="meeting_proposals")
