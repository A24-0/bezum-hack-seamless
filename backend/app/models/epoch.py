import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EpochStatus(str, enum.Enum):
    planning = "planning"
    active = "active"
    completed = "completed"


class Epoch(Base):
    __tablename__ = "epochs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[EpochStatus] = mapped_column(
        Enum(EpochStatus), nullable=False, default=EpochStatus.planning
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="epochs")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="epoch")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="epoch")
    meetings: Mapped[list["Meeting"]] = relationship("Meeting", back_populates="epoch")
    releases: Mapped[list["Release"]] = relationship(
        "Release", back_populates="epoch", cascade="all, delete-orphan"
    )
