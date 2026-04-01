from datetime import datetime

from pydantic import BaseModel

from app.models.task import TaskStatus


class TaskLabelBase(BaseModel):
    label: str
    color: str = "#6366f1"


class TaskLabelCreate(TaskLabelBase):
    pass


class TaskLabelRead(TaskLabelBase):
    id: int
    task_id: int

    model_config = {"from_attributes": True}


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    status: TaskStatus = TaskStatus.backlog
    assignee_id: int | None = None
    epoch_id: int | None = None
    parent_task_id: int | None = None
    due_date: datetime | None = None
    order_index: int = 0


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    assignee_id: int | None = None
    epoch_id: int | None = None
    parent_task_id: int | None = None
    due_date: datetime | None = None
    order_index: int | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskRead(TaskBase):
    id: int
    project_id: int
    reporter_id: int
    created_at: datetime
    updated_at: datetime
    labels: list[TaskLabelRead] = []

    model_config = {"from_attributes": True}


class TaskWatcherRead(BaseModel):
    task_id: int
    user_id: int

    model_config = {"from_attributes": True}
