from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import UserRole, ProjectMemberRole


class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: UserRole = UserRole.developer


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    id: int
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole

    model_config = {"from_attributes": True}


class ProjectMemberCreate(BaseModel):
    user_id: int
    role: ProjectMemberRole = ProjectMemberRole.developer


class ProjectMemberRead(BaseModel):
    project_id: int
    user_id: int
    role: ProjectMemberRole
    user: UserPublic

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
