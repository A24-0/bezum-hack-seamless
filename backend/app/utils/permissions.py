from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User, ProjectMember, UserRole, ProjectMemberRole
from app.models.document import DocumentVisibility


async def get_project_member(db: AsyncSession, project_id: int, user_id: int) -> ProjectMember | None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def require_project_access(db: AsyncSession, project_id: int, user: User) -> ProjectMember:
    if user.role == UserRole.manager:
        member = await get_project_member(db, project_id, user.id)
        if not member:
            # Managers can access all projects but may not be explicitly listed
            # Create a virtual member object
            member = ProjectMember(project_id=project_id, user_id=user.id, role=ProjectMemberRole.manager)
        return member
    member = await get_project_member(db, project_id, user.id)
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return member


async def require_manager_or_developer(db: AsyncSession, project_id: int, user: User) -> ProjectMember:
    member = await require_project_access(db, project_id, user)
    if member.role == ProjectMemberRole.customer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return member


async def require_manager(db: AsyncSession, project_id: int, user: User) -> ProjectMember:
    member = await require_project_access(db, project_id, user)
    if member.role != ProjectMemberRole.manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")
    return member


def can_view_document(member_role: ProjectMemberRole, visibility: DocumentVisibility) -> bool:
    if visibility == DocumentVisibility.public:
        return True
    if visibility == DocumentVisibility.managers_devs:
        return member_role in (ProjectMemberRole.manager, ProjectMemberRole.developer)
    if visibility == DocumentVisibility.managers_only:
        return member_role == ProjectMemberRole.manager
    return False
