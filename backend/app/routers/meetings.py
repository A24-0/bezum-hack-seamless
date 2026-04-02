import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.meeting import Meeting, MeetingParticipant, MeetingTimeProposal, MeetingStatus, MeetingParticipantStatus
from app.models.notification import NotificationType
from app.services.auth import get_current_user
from app.services.notification import create_notification, notify_many
from app.services.summarization import summarize_transcript
from app.utils.permissions import require_project_access, require_manager_or_developer
from app.utils.meeting_datetime import assert_reasonable_meeting_datetime

router = APIRouter(prefix="/projects/{project_id}/meetings", tags=["meetings"])


def _meeting_dict(m: Meeting) -> dict:
    participants = []
    for p in (m.participants or []):
        user_data = None
        if hasattr(p, 'user') and p.user:
            user_data = {"id": p.user.id, "name": p.user.name, "email": p.user.email, "role": p.user.role}
        participants.append({"user_id": p.user_id, "status": p.status, "user": user_data})

    proposals = []
    for tp in (m.time_proposals or []):
        votes = tp.votes or {}
        proposals.append({
            "id": tp.id,
            "proposed_at": tp.proposed_at,
            "proposed_by_id": tp.proposed_by_id,
            "vote_count": sum(1 for v in votes.values() if v),
            "votes": votes,
        })

    created_by = None
    if hasattr(m, 'created_by') and m.created_by:
        created_by = {"id": m.created_by.id, "name": m.created_by.name}

    return {
        "id": m.id,
        "project_id": m.project_id,
        "epoch_id": m.epoch_id,
        "task_id": m.task_id,
        "title": m.title,
        "description": m.description,
        "status": m.status,
        "scheduled_at": m.scheduled_at,
        "duration_minutes": m.duration_minutes,
        "jitsi_room_id": m.jitsi_room_id,
        "recording_url": m.recording_url,
        "transcript": m.transcript,
        "summary": m.summary,
        "created_by_id": m.created_by_id,
        "created_by": created_by,
        "created_at": m.created_at,
        "participants": participants,
        "time_proposals": proposals,
    }


@router.get("")
async def list_meetings(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            selectinload(Meeting.time_proposals),
            selectinload(Meeting.created_by),
        )
        .where(Meeting.project_id == project_id)
        .order_by(Meeting.created_at.desc())
    )
    return [_meeting_dict(m) for m in result.scalars().all()]


@router.post("", status_code=201)
async def create_meeting(
    project_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    meeting = Meeting(
        project_id=project_id,
        title=data.get("title", "New Meeting"),
        description=data.get("description"),
        epoch_id=data.get("epoch_id"),
        task_id=data.get("task_id"),
        jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
        created_by_id=current_user.id,
        duration_minutes=data.get("duration_minutes", 60),
        status=MeetingStatus.scheduling,
    )
    if data.get("scheduled_at"):
        try:
            sa = datetime.fromisoformat(str(data["scheduled_at"]).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            raise HTTPException(400, "Некорректная дата/время встречи")
        try:
            meeting.scheduled_at = assert_reasonable_meeting_datetime(sa)
        except ValueError as e:
            raise HTTPException(400, str(e))
        meeting.status = MeetingStatus.scheduled

    db.add(meeting)
    await db.flush()

    # Add participants
    participant_ids = set(data.get("participant_ids", []))
    participant_ids.add(current_user.id)
    for uid in participant_ids:
        db.add(MeetingParticipant(meeting_id=meeting.id, user_id=uid))

    # Add time proposals if provided
    for slot in data.get("time_slots", []):
        try:
            pa = datetime.fromisoformat(str(slot).replace("Z", "+00:00"))
            pa = assert_reasonable_meeting_datetime(pa)
        except ValueError as e:
            if "Дата встречи" in str(e):
                raise HTTPException(400, str(e))
            raise HTTPException(400, "Некорректная дата/время в слоте")
        except TypeError:
            raise HTTPException(400, "Некорректная дата/время в слоте")
        tp = MeetingTimeProposal(
            meeting_id=meeting.id,
            proposed_by_id=current_user.id,
            proposed_at=pa,
            votes={},
        )
        db.add(tp)

    await db.flush()
    await db.refresh(meeting, ["participants", "time_proposals", "created_by"])

    # Notify participants
    notify_ids = [uid for uid in participant_ids if uid != current_user.id]
    await notify_many(db, notify_ids, NotificationType.meeting_scheduled, f"Meeting invited: {meeting.title}", f"You have been invited to a meeting", "meeting", str(meeting.id))

    return _meeting_dict(meeting)


@router.get("/{meeting_id}")
async def get_meeting(
    project_id: int,
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(
            selectinload(Meeting.participants).selectinload(MeetingParticipant.user),
            selectinload(Meeting.time_proposals),
            selectinload(Meeting.created_by),
        )
        .where(Meeting.id == meeting_id, Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return _meeting_dict(meeting)


@router.put("/{meeting_id}")
async def update_meeting(
    project_id: int,
    meeting_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.participants).selectinload(MeetingParticipant.user), selectinload(Meeting.time_proposals), selectinload(Meeting.created_by))
        .where(Meeting.id == meeting_id, Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    for field in ["title", "description", "duration_minutes", "status"]:
        if field in data:
            setattr(meeting, field, data[field])
    if "scheduled_at" in data and data["scheduled_at"]:
        try:
            sa = datetime.fromisoformat(str(data["scheduled_at"]).replace("Z", "+00:00"))
            meeting.scheduled_at = assert_reasonable_meeting_datetime(sa)
        except ValueError as e:
            if "Дата встречи" in str(e):
                raise HTTPException(400, str(e))
            raise HTTPException(400, "Некорректная дата/время встречи")
        except TypeError:
            raise HTTPException(400, "Некорректная дата/время встречи")
    await db.flush()
    return _meeting_dict(meeting)


@router.post("/{meeting_id}/time-proposals", status_code=201)
async def propose_times(
    project_id: int,
    meeting_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    slots = data.get("slots", [])
    created = []
    for slot in slots:
        try:
            proposed_at = datetime.fromisoformat(str(slot).replace("Z", "+00:00"))
            proposed_at = assert_reasonable_meeting_datetime(proposed_at)
        except ValueError as e:
            if "Дата встречи" in str(e):
                raise HTTPException(400, str(e))
            raise HTTPException(400, "Некорректная дата/время в слоте")
        except TypeError:
            raise HTTPException(400, "Некорректная дата/время в слоте")
        tp = MeetingTimeProposal(
            meeting_id=meeting_id,
            proposed_by_id=current_user.id,
            proposed_at=proposed_at,
            votes={},
        )
        db.add(tp)
        await db.flush()
        created.append({"id": tp.id, "proposed_at": tp.proposed_at, "votes": {}})
    return created


@router.post("/{meeting_id}/time-proposals/{proposal_id}/vote")
async def vote_proposal(
    project_id: int,
    meeting_id: int,
    proposal_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(MeetingTimeProposal).where(MeetingTimeProposal.id == proposal_id, MeetingTimeProposal.meeting_id == meeting_id))
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(404, "Proposal not found")
    votes = dict(proposal.votes or {})
    votes[str(current_user.id)] = data.get("available", True)
    proposal.votes = votes
    await db.flush()
    return {"id": proposal.id, "votes": votes, "vote_count": sum(1 for v in votes.values() if v)}


@router.post("/{meeting_id}/finalize-time")
async def finalize_time(
    project_id: int,
    meeting_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.participants).selectinload(MeetingParticipant.user), selectinload(Meeting.time_proposals), selectinload(Meeting.created_by))
        .where(Meeting.id == meeting_id, Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    proposal_id = data.get("proposal_id")
    if proposal_id:
        proposal_result = await db.execute(select(MeetingTimeProposal).where(MeetingTimeProposal.id == proposal_id))
        proposal = proposal_result.scalar_one_or_none()
        if proposal:
            meeting.scheduled_at = proposal.proposed_at
    else:
        # Auto-pick best slot
        best = None
        best_votes = -1
        for tp in meeting.time_proposals:
            votes = tp.votes or {}
            vote_count = sum(1 for v in votes.values() if v)
            if vote_count > best_votes:
                best_votes = vote_count
                best = tp
        if best:
            meeting.scheduled_at = best.proposed_at

    meeting.status = MeetingStatus.scheduled
    await db.flush()

    # Notify all participants
    participant_ids = [p.user_id for p in meeting.participants if p.user_id != current_user.id]
    await notify_many(db, participant_ids, NotificationType.meeting_scheduled, f"Meeting scheduled: {meeting.title}", f"Meeting set for {meeting.scheduled_at}", "meeting", str(meeting.id))

    return _meeting_dict(meeting)


@router.post("/{meeting_id}/transcript")
async def upload_transcript(
    project_id: int,
    meeting_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.participants).selectinload(MeetingParticipant.user), selectinload(Meeting.time_proposals), selectinload(Meeting.created_by))
        .where(Meeting.id == meeting_id, Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    meeting.transcript = data.get("transcript", "")
    await db.flush()
    return _meeting_dict(meeting)


@router.post("/{meeting_id}/summarize")
async def summarize_meeting(
    project_id: int,
    meeting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Meeting)
        .options(selectinload(Meeting.participants).selectinload(MeetingParticipant.user), selectinload(Meeting.time_proposals), selectinload(Meeting.created_by))
        .where(Meeting.id == meeting_id, Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if not meeting.transcript:
        raise HTTPException(400, "No transcript available")
    meeting.summary = await summarize_transcript(meeting.transcript)
    meeting.status = MeetingStatus.completed
    await db.flush()
    return _meeting_dict(meeting)


@router.post("/{meeting_id}/rsvp")
async def rsvp_meeting(
    project_id: int,
    meeting_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting_id, MeetingParticipant.user_id == current_user.id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(404, "Not a participant")
    rsvp = data.get("rsvp", "accepted")
    participant.status = rsvp
    participant.responded_at = datetime.now(timezone.utc)
    await db.flush()
    return {"meeting_id": meeting_id, "user_id": current_user.id, "status": participant.status}
