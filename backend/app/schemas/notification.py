from datetime import datetime

from pydantic import BaseModel

from app.models.notification import NotificationType


class NotificationRead(BaseModel):
    id: int
    user_id: int
    type: NotificationType
    title: str
    body: str
    entity_type: str | None
    entity_id: int | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
