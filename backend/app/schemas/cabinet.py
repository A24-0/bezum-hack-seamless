from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class CabinetTechUpdate(BaseModel):
    techs: list[str] = []
    git_repo_url: Optional[str] = None
    name: Optional[str] = None


class CabinetTechRead(BaseModel):
    tech: str


class CabinetMeRead(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: UserRole
    created_at: datetime
    is_active: bool
    git_repo_url: Optional[str] = None
    techs: list[str] = []

    model_config = {"from_attributes": True}


class CabinetUserRead(BaseModel):
    id: int
    name: str
    role: UserRole
    git_repo_url: Optional[str] = None
    techs: list[str] = []

    model_config = {"from_attributes": True}


class CabinetMatchResponse(BaseModel):
    candidates: list[CabinetUserRead]

