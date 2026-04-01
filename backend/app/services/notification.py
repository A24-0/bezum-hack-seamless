import json
from typing import Any
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.connections:
            self.connections[user_id].discard(websocket) if hasattr(self.connections[user_id], 'discard') else None
            try:
                self.connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to_user(self, user_id: int, data: dict):
        for ws in self.connections.get(user_id, []):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                pass


manager = ConnectionManager()


async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: NotificationType,
    title: str,
    body: str,
    entity_type: str = "",
    entity_id: str = "",
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)

    await manager.send_to_user(user_id, {
        "type": "notification",
        "data": {
            "id": notif.id,
            "type": notif.type,
            "title": notif.title,
            "body": notif.body,
            "entity_type": notif.entity_type,
            "entity_id": notif.entity_id,
            "is_read": notif.is_read,
            "created_at": notif.created_at.isoformat(),
        }
    })
    return notif


async def notify_many(
    db: AsyncSession,
    user_ids: list[int],
    type: NotificationType,
    title: str,
    body: str,
    entity_type: str = "",
    entity_id: str = "",
):
    for uid in set(user_ids):
        await create_notification(db, uid, type, title, body, entity_type, entity_id)
