from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.cicd import PRStatus


class PullRequestRead(BaseModel):
    id: int
    project_id: int
    task_id: int | None
    gitlab_pr_id: int
    title: str
    url: str
    status: PRStatus
    source_branch: str
    target_branch: str
    created_at: datetime
    updated_at: datetime
    author_id: int | None

    model_config = {"from_attributes": True}


class PRTaskLinkRequest(BaseModel):
    task_id: int


class GitLabWebhookPayload(BaseModel):
    object_kind: str
    project: dict[str, Any] | None = None
    object_attributes: dict[str, Any] | None = None
    user: dict[str, Any] | None = None

    model_config = {"extra": "allow"}
