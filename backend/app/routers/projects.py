from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User, ProjectMember, ProjectMemberRole, UserRole
from app.models.project import Project
from app.models.epoch import Epoch
from app.models.task import Task, TaskStatus
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.user import ProjectMemberCreate
from app.services.auth import get_current_user
from app.utils.permissions import require_project_access, require_manager

router = APIRouter(prefix="/projects", tags=["projects"])


def _project_dict(project: Project, member_count: int = 0, epoch_count: int = 0, progress: int = 0) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "created_at": project.created_at,
        "gitlab_repo_url": project.gitlab_repo_url,
        "gitlab_project_id": project.gitlab_project_id,
        "member_count": member_count,
        "epoch_count": epoch_count,
        "progress": progress,
    }


@router.get("")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in (UserRole.manager, UserRole.admin):
        result = await db.execute(select(Project))
        projects = result.scalars().all()
    else:
        result = await db.execute(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == current_user.id)
        )
        projects = result.scalars().all()

    out = []
    for p in projects:
        mc = await db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == p.id))
        ec = await db.execute(select(func.count()).select_from(Epoch).where(Epoch.project_id == p.id))
        total_tasks = await db.execute(select(func.count()).select_from(Task).where(Task.project_id == p.id))
        done_tasks = await db.execute(
            select(func.count()).select_from(Task).where(Task.project_id == p.id, Task.status == TaskStatus.done)
        )
        total = total_tasks.scalar() or 0
        done = done_tasks.scalar() or 0
        prog = int(done / total * 100) if total > 0 else 0
        out.append(_project_dict(p, mc.scalar(), ec.scalar(), prog))
    return out


@router.post("", status_code=201)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        name=data.name,
        description=data.description,
        gitlab_repo_url=data.gitlab_repo_url,
        gitlab_project_id=data.gitlab_project_id,
        status=data.status,
    )
    db.add(project)
    await db.flush()
    # Add creator as manager
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role=ProjectMemberRole.manager)
    db.add(member)
    await db.flush()
    await db.refresh(project)
    return _project_dict(project, 1, 0, 0)


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    mc = await db.execute(select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == project_id))
    ec = await db.execute(select(func.count()).select_from(Epoch).where(Epoch.project_id == project_id))

    # Compute progress
    total_tasks = await db.execute(select(func.count()).select_from(Task).where(Task.project_id == project_id))
    done_tasks = await db.execute(select(func.count()).select_from(Task).where(Task.project_id == project_id, Task.status == TaskStatus.done))
    total = total_tasks.scalar() or 0
    done = done_tasks.scalar() or 0
    progress = int(done / total * 100) if total > 0 else 0

    return _project_dict(project, mc.scalar(), ec.scalar(), progress)


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager(db, project_id, current_user)
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(project, field, val)
    await db.flush()
    return _project_dict(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager(db, project_id, current_user)
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)


@router.get("/{project_id}/members")
async def list_members(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(ProjectMember).options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
    )
    members = result.scalars().all()
    return [
        {
            "project_id": m.project_id,
            "user_id": m.user_id,
            "role": m.role,
            "user": {"id": m.user.id, "name": m.user.name, "email": m.user.email, "role": m.user.role},
        }
        for m in members
    ]


@router.post("/{project_id}/members", status_code=201)
async def add_member(
    project_id: int,
    data: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager(db, project_id, current_user)
    existing = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == data.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "User already a member")
    member = ProjectMember(project_id=project_id, user_id=data.user_id, role=data.role)
    db.add(member)
    await db.flush()
    result = await db.execute(select(User).where(User.id == data.user_id))
    user = result.scalar_one_or_none()
    return {
        "project_id": member.project_id,
        "user_id": member.user_id,
        "role": member.role,
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role} if user else None,
    }


@router.put("/{project_id}/members/{user_id}")
async def update_member(
    project_id: int,
    user_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager(db, project_id, current_user)
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")
    if "role" in data:
        member.role = data["role"]
    await db.flush()
    return {"project_id": member.project_id, "user_id": member.user_id, "role": member.role}


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager(db, project_id, current_user)
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")
    await db.delete(member)
