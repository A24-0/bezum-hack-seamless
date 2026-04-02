from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole, UserTech
from app.schemas.cabinet import CabinetMatchResponse, CabinetMeRead, CabinetTechUpdate, CabinetUserRead
from app.services.auth import get_current_user

router = APIRouter(prefix="/cabinet", tags=["cabinet"])


async def _get_user_techs(db: AsyncSession, user_id: int) -> list[str]:
    res = await db.execute(select(UserTech.tech).where(UserTech.user_id == user_id))
    rows = res.scalars().all()
    return [t for t in rows if isinstance(t, str)]


@router.get("/me", response_model=CabinetMeRead)
async def me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    techs = await _get_user_techs(db, current_user.id)
    return CabinetMeRead(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
        git_repo_url=getattr(current_user, "git_repo_url", None),
        techs=techs,
    )


@router.put("/me", response_model=CabinetMeRead)
async def update_me(
    payload: CabinetTechUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.name is not None:
        current_user.name = payload.name
    if payload.git_repo_url is not None:
        current_user.git_repo_url = payload.git_repo_url.strip() or None

    # Replace tech tags
    techs = []
    for t in payload.techs or []:
        tt = (t or "").strip()
        if tt:
            techs.append(tt)
    techs = sorted(set(techs), key=str.lower)

    await db.execute(delete(UserTech).where(UserTech.user_id == current_user.id))
    for tech in techs:
        db.add(UserTech(user_id=current_user.id, tech=tech))
    await db.flush()

    techs_read = await _get_user_techs(db, current_user.id)
    return CabinetMeRead(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
        git_repo_url=getattr(current_user, "git_repo_url", None),
        techs=techs_read,
    )


@router.get("/users/{user_id}", response_model=CabinetUserRead)
async def user_public(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Кабинет публичный для залогиненных.
    res = await db.execute(select(User).where(User.id == user_id))
    u = res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    techs = await _get_user_techs(db, user_id)
    return CabinetUserRead(id=u.id, name=u.name, role=u.role, git_repo_url=getattr(u, "git_repo_url", None), techs=techs)


@router.get("/match", response_model=CabinetMatchResponse)
async def match_by_tech(
    techs: str = Query(..., description="Comma-separated tech tags (e.g. React,FastAPI)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tech_list = []
    for t in (techs or "").split(","):
        tt = (t or "").strip()
        if tt:
            tech_list.append(tt)
    tech_list = sorted(set(tech_list), key=str.lower)
    tech_list_lower = sorted({t.lower() for t in tech_list if t})
    if not tech_list_lower:
        return CabinetMatchResponse(candidates=[])

    # Match candidates that have at least one requested tag.
    # Ranking is by number of overlapping tags.
    overlap_res = await db.execute(
        select(UserTech.user_id, func.count(UserTech.tech).label("score"))
        .where(func.lower(UserTech.tech).in_(tech_list_lower), UserTech.user_id != current_user.id)
        .group_by(UserTech.user_id)
        .order_by(func.count(UserTech.tech).desc())
        .limit(10)
    )
    user_ids = [r[0] for r in overlap_res.all()]
    if not user_ids:
        return CabinetMatchResponse(candidates=[])

    users_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in users_res.scalars().all()}

    candidates: list[CabinetUserRead] = []
    # Preserve ranking order
    for uid in user_ids:
        u = users.get(uid)
        if not u:
            continue
        tlist = await _get_user_techs(db, uid)
        candidates.append(
            CabinetUserRead(
                id=u.id,
                name=u.name,
                role=u.role,
                git_repo_url=getattr(u, "git_repo_url", None),
                techs=tlist,
            )
        )
    return CabinetMatchResponse(candidates=candidates)


@router.get("/techs")
async def list_techs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Unique tech tags in DB, sorted.
    res = await db.execute(select(UserTech.tech).distinct().order_by(UserTech.tech))
    techs = [t for t in res.scalars().all() if isinstance(t, str) and t.strip()]
    # Return only normalized unique values.
    seen: set[str] = set()
    out: list[str] = []
    for t in techs:
        key = t.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(t.strip())
    return {"techs": out}

