import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, ProjectMember
from app.models.task import Task, TaskLabel, TaskWatcher, TaskStatus
from app.models.document import Document, DocumentTaskLink
from app.models.meeting import Meeting, MeetingParticipant, MeetingStatus
from app.models.cicd import PullRequest
from app.models.notification import NotificationType
from app.schemas.task import TaskCreate, TaskUpdate, TaskStatusUpdate, TaskLabelCreate
from app.services.auth import get_current_user
from app.services.notification import create_notification, notify_many
from app.utils.permissions import require_project_access, require_manager_or_developer

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


def _user_dict(u: User | None) -> dict | None:
    if not u:
        return None
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


def _task_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "epoch_id": task.epoch_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "assignee_id": task.assignee_id,
        "assignee": _user_dict(task.assignee) if hasattr(task, 'assignee') and task.assignee else None,
        "reporter_id": task.reporter_id,
        "reporter": _user_dict(task.reporter) if hasattr(task, 'reporter') and task.reporter else None,
        "parent_task_id": task.parent_task_id,
        "due_date": task.due_date,
        "order_index": task.order_index,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "labels": [{"id": l.id, "label": l.label, "color": l.color} for l in (task.labels or [])],
        "watchers": [{"id": w.user_id} for w in (task.watchers or [])],
    }


@router.get("")
async def list_tasks(
    project_id: int,
    epoch_id: int | None = None,
    status: str | None = None,
    assignee_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    query = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.reporter), selectinload(Task.labels), selectinload(Task.watchers))
        .where(Task.project_id == project_id)
    )
    if epoch_id:
        query = query.where(Task.epoch_id == epoch_id)
    if status:
        query = query.where(Task.status == status)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    query = query.order_by(Task.order_index)
    result = await db.execute(query)
    return [_task_dict(t) for t in result.scalars().all()]


@router.post("", status_code=201)
async def create_task(
    project_id: int,
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    task = Task(project_id=project_id, reporter_id=current_user.id, **data.model_dump())
    db.add(task)
    await db.flush()
    await db.refresh(task, ["assignee", "reporter", "labels", "watchers"])
    if task.assignee_id and task.assignee_id != current_user.id:
        await create_notification(db, task.assignee_id, NotificationType.mention, f"Task assigned: {task.title}", f"You were assigned to task '{task.title}'", "task", str(task.id))
    return _task_dict(task)


@router.get("/{task_id}")
async def get_task(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.reporter), selectinload(Task.labels), selectinload(Task.watchers))
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    return _task_dict(task)


@router.put("/{task_id}")
async def update_task(
    project_id: int,
    task_id: int,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.reporter), selectinload(Task.labels), selectinload(Task.watchers))
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    old_assignee = task.assignee_id
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(task, field, val)
    await db.flush()
    # Notify new assignee
    if task.assignee_id and task.assignee_id != old_assignee:
        await create_notification(db, task.assignee_id, NotificationType.mention, f"Task assigned: {task.title}", f"You were assigned to '{task.title}'", "task", str(task.id))
    await db.refresh(task, ["assignee", "reporter", "labels", "watchers"])
    return _task_dict(task)


@router.patch("/{task_id}/status")
async def update_task_status(
    project_id: int,
    task_id: int,
    data: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.reporter), selectinload(Task.labels), selectinload(Task.watchers))
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    old_status = task.status
    task.status = data.status
    await db.flush()
    # Notify watchers and assignee
    watcher_ids = [w.user_id for w in task.watchers]
    if task.assignee_id:
        watcher_ids.append(task.assignee_id)
    watcher_ids = [uid for uid in watcher_ids if uid != current_user.id]
    await notify_many(db, watcher_ids, NotificationType.task_status_changed, f"Task status changed: {task.title}", f"Status changed from {old_status} to {data.status}", "task", str(task.id))
    await db.refresh(task, ["assignee", "reporter", "labels", "watchers"])
    return _task_dict(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    await db.delete(task)


@router.post("/{task_id}/watch", status_code=201)
async def watch_task(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    existing = await db.execute(select(TaskWatcher).where(TaskWatcher.task_id == task_id, TaskWatcher.user_id == current_user.id))
    if not existing.scalar_one_or_none():
        db.add(TaskWatcher(task_id=task_id, user_id=current_user.id))
        await db.flush()
    return {"task_id": task_id, "user_id": current_user.id}


@router.delete("/{task_id}/watch", status_code=204)
async def unwatch_task(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TaskWatcher).where(TaskWatcher.task_id == task_id, TaskWatcher.user_id == current_user.id))
    watcher = result.scalar_one_or_none()
    if watcher:
        await db.delete(watcher)


@router.get("/{task_id}/documents")
async def task_documents(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Document).join(DocumentTaskLink, DocumentTaskLink.document_id == Document.id)
        .where(DocumentTaskLink.task_id == task_id)
    )
    docs = result.scalars().all()
    return [{"id": d.id, "title": d.title, "status": d.status, "visibility": d.visibility, "current_version": d.current_version} for d in docs]


@router.get("/{task_id}/meetings")
async def task_meetings(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(Meeting).where(Meeting.task_id == task_id))
    meetings = result.scalars().all()
    return [{"id": m.id, "title": m.title, "status": m.status, "scheduled_at": m.scheduled_at, "jitsi_room_id": m.jitsi_room_id} for m in meetings]


@router.post("/{task_id}/meeting", status_code=201)
async def create_meeting_from_task(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(Task).options(selectinload(Task.watchers)).where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    meeting = Meeting(
        project_id=project_id,
        epoch_id=task.epoch_id,
        task_id=task_id,
        title=f"Meeting: {task.title}",
        jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
        created_by_id=current_user.id,
        status=MeetingStatus.scheduling,
    )
    db.add(meeting)
    await db.flush()

    # Add participants: creator, assignee, reporter, watchers
    participant_ids = {current_user.id}
    if task.assignee_id:
        participant_ids.add(task.assignee_id)
    if task.reporter_id:
        participant_ids.add(task.reporter_id)
    for w in task.watchers:
        participant_ids.add(w.user_id)

    for uid in participant_ids:
        db.add(MeetingParticipant(meeting_id=meeting.id, user_id=uid))

    await db.flush()
    return {
        "id": meeting.id,
        "title": meeting.title,
        "status": meeting.status,
        "jitsi_room_id": meeting.jitsi_room_id,
        "task_id": meeting.task_id,
        "project_id": meeting.project_id,
    }


@router.get("/{task_id}/prs")
async def task_prs(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(PullRequest).where(PullRequest.task_id == task_id))
    prs = result.scalars().all()
    return [{"id": p.id, "title": p.title, "status": p.status, "source_branch": p.source_branch, "url": p.url, "gitlab_pr_id": p.gitlab_pr_id} for p in prs]


@router.get("/{task_id}/activity")
async def task_activity(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    return []


@router.get("/{task_id}/comments")
async def task_comments(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    return []


@router.post("/{task_id}/comments", status_code=201)
async def add_comment(
    project_id: int,
    task_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    return {"id": 1, "task_id": task_id, "content": data.get("content"), "user": _user_dict(current_user)}
