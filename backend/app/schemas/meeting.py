from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.meeting import MeetingStatus, MeetingParticipantStatus


class MeetingBase(BaseModel):
    title: str
    description: str | None = None
    duration_minutes: int = 60
    epoch_id: int | None = None


class MeetingCreate(MeetingBase):
    pass


class MeetingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    status: MeetingStatus | None = None
    scheduled_at: datetime | None = None
    recording_url: str | None = None
    transcript: str | None = None
    summary: str | None = None
    epoch_id: int | None = None


class MeetingParticipantRead(BaseModel):
    meeting_id: int
    user_id: int
    status: MeetingParticipantStatus
    responded_at: datetime | None

    model_config = {"from_attributes": True}


class MeetingRead(MeetingBase):
    id: int
    project_id: int
    task_id: int | None
    status: MeetingStatus
    scheduled_at: datetime | None
    jitsi_room_id: str
    jitsi_room_url: str | None = None
    recording_url: str | None
    transcript: str | None
    summary: str | None
    created_by_id: int
    created_at: datetime
    participants: list[MeetingParticipantRead] = []

    model_config = {"from_attributes": True}


class TimeProposalCreate(BaseModel):
    proposed_at: datetime


class TimeProposalRead(BaseModel):
    id: int
    meeting_id: int
    proposed_by_id: int
    proposed_at: datetime
    votes: dict[str, Any]

    model_config = {"from_attributes": True}


class VoteCreate(BaseModel):
    vote: bool


class MeetingCompleteRequest(BaseModel):
    transcript: str | None = None
    summary: str | None = None
    recording_url: str | None = None


class SummarizeRequest(BaseModel):
    transcript: str
