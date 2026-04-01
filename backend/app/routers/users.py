from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def search_users(
    q: str = Query("", min_length=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(User).where(User.is_active == True)
    if q:
        like = f"%{q}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like)))
    query = query.limit(20)
    result = await db.execute(query)
    users = result.scalars().all()
    return [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in users]
