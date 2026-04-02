from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.epoch import Epoch, EpochStatus
from app.models.document import Document, DocumentStatus
from app.models.meeting import Meeting
from app.schemas.user import UserUpdate
from app.utils.permissions import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    def _enum_value(v: object) -> str:
        # SQLAlchemy enums can come as `TaskStatus.in_progress` where `str(v)` is "TaskStatus.in_progress".
        # We want the raw value (e.g. "in_progress") for UI matching.
        return getattr(v, "value", str(v))
    users = await db.execute(select(func.count()).select_from(User))
    projects = await db.execute(select(func.count()).select_from(Project))
    tasks = await db.execute(select(func.count()).select_from(Task))
    epochs = await db.execute(select(func.count()).select_from(Epoch))
    documents = await db.execute(select(func.count()).select_from(Document))
    meetings = await db.execute(select(func.count()).select_from(Meeting))
    tasks_by_status_rows = await db.execute(
        select(Task.status, func.count()).group_by(Task.status)
    )
    tasks_by_status = {_enum_value(r[0]): int(r[1]) for r in tasks_by_status_rows.fetchall()}

    documents_by_status_rows = await db.execute(
        select(Document.status, func.count()).group_by(Document.status)
    )
    documents_by_status = {_enum_value(r[0]): int(r[1]) for r in documents_by_status_rows.fetchall()}

    epochs_by_status_rows = await db.execute(
        select(Epoch.status, func.count()).group_by(Epoch.status)
    )
    epochs_by_status = {_enum_value(r[0]): int(r[1]) for r in epochs_by_status_rows.fetchall()}

    return {
        "users": users.scalar() or 0,
        "projects": projects.scalar() or 0,
        "tasks": tasks.scalar() or 0,
        "epochs": epochs.scalar() or 0,
        "documents": documents.scalar() or 0,
        "meetings": meetings.scalar() or 0,
        "tasks_by_status": tasks_by_status,
        "documents_by_status": documents_by_status,
        "epochs_by_status": epochs_by_status,
    }


@router.get("/users")
async def admin_list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.id.asc()))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.name is not None:
        user.name = data.name
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    await db.flush()
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_active": user.is_active,
    }
