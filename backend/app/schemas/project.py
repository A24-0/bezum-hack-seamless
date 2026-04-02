from datetime import datetime

from pydantic import BaseModel

from app.models.project import ProjectStatus


class ProjectBase(BaseModel):
    name: str
    description: str | None = None
    status: ProjectStatus = ProjectStatus.draft
    gitlab_repo_url: str | None = None
    gitlab_project_id: int | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: ProjectStatus | None = None
    gitlab_repo_url: str | None = None
    gitlab_project_id: int | None = None


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ReleaseBase(BaseModel):
    name: str
    description: str | None = None
    version_tag: str


class ReleaseCreate(ReleaseBase):
    pass


class ReleaseRead(ReleaseBase):
    id: int
    epoch_id: int
    created_at: datetime
    created_by_id: int | None

    model_config = {"from_attributes": True}
