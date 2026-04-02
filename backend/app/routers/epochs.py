from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.epoch import Epoch
from app.models.task import Task, TaskStatus
from app.models.project import Release
from app.schemas.epoch import EpochCreate, EpochUpdate
from app.schemas.project import ReleaseCreate
from app.services.auth import get_current_user
from app.utils.permissions import require_project_access, require_manager_or_developer

router = APIRouter(prefix="/projects/{project_id}/epochs", tags=["epochs"])


def _epoch_dict(epoch: Epoch, progress: int = 0, task_count: int = 0, done_count: int = 0) -> dict:
    return {
        "id": epoch.id,
        "project_id": epoch.project_id,
        "name": epoch.name,
        "goals": epoch.goals,
        "start_date": epoch.start_date,
        "end_date": epoch.end_date,
        "status": epoch.status,
        "order_index": epoch.order_index,
        "progress": progress,
        "task_count": task_count,
        "completed_task_count": done_count,
    }


@router.get("")
async def list_epochs(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(Epoch).where(Epoch.project_id == project_id).order_by(Epoch.order_index)
    )
    epochs = result.scalars().all()
    out = []
    for e in epochs:
        tc = await db.execute(select(func.count()).select_from(Task).where(Task.epoch_id == e.id))
        dc = await db.execute(select(func.count()).select_from(Task).where(Task.epoch_id == e.id, Task.status == TaskStatus.done))
        total = tc.scalar() or 0
        done = dc.scalar() or 0
        progress = int(done / total * 100) if total > 0 else 0
        out.append(_epoch_dict(e, progress, total, done))
    return out


@router.post("", status_code=201)
async def create_epoch(
    project_id: int,
    data: EpochCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    epoch = Epoch(project_id=project_id, **data.model_dump())
    db.add(epoch)
    await db.flush()
    await db.refresh(epoch)
    return _epoch_dict(epoch)


@router.get("/{epoch_id}")
async def get_epoch(
    project_id: int,
    epoch_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(Epoch).where(Epoch.id == epoch_id, Epoch.project_id == project_id))
    epoch = result.scalar_one_or_none()
    if not epoch:
        raise HTTPException(404, "Epoch not found")
    tc = await db.execute(select(func.count()).select_from(Task).where(Task.epoch_id == epoch_id))
    dc = await db.execute(select(func.count()).select_from(Task).where(Task.epoch_id == epoch_id, Task.status == TaskStatus.done))
    total = tc.scalar() or 0
    done = dc.scalar() or 0
    progress = int(done / total * 100) if total > 0 else 0
    return _epoch_dict(epoch, progress, total, done)


@router.put("/{epoch_id}")
async def update_epoch(
    project_id: int,
    epoch_id: int,
    data: EpochUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(Epoch).where(Epoch.id == epoch_id, Epoch.project_id == project_id))
    epoch = result.scalar_one_or_none()
    if not epoch:
        raise HTTPException(404, "Epoch not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(epoch, field, val)
    if epoch.start_date and epoch.end_date and epoch.end_date < epoch.start_date:
        raise HTTPException(400, "Дата окончания не может быть раньше даты начала")
    await db.flush()
    return _epoch_dict(epoch)


@router.delete("/{epoch_id}", status_code=204)
async def delete_epoch(
    project_id: int,
    epoch_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(Epoch).where(Epoch.id == epoch_id, Epoch.project_id == project_id))
    epoch = result.scalar_one_or_none()
    if not epoch:
        raise HTTPException(404, "Epoch not found")
    await db.delete(epoch)


@router.post("/{epoch_id}/release", status_code=201)
async def create_release(
    project_id: int,
    epoch_id: int,
    data: ReleaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    release = Release(epoch_id=epoch_id, created_by_id=current_user.id, **data.model_dump())
    db.add(release)
    await db.flush()
    await db.refresh(release)
    return {
        "id": release.id,
        "epoch_id": release.epoch_id,
        "name": release.name,
        "description": release.description,
        "version_tag": release.version_tag,
        "created_at": release.created_at,
        "created_by_id": release.created_by_id,
    }
