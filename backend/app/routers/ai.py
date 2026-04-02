from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_user
from app.services.ai_chat import chat_with_ai
from app.services.ai_chat import summarize_document_text
from app.services.ai_project_context import build_project_ai_context
from app.utils.permissions import require_project_access

router = APIRouter(prefix="/ai", tags=["ai"])


class AiChatRequest(BaseModel):
    message: str
    project_id: Optional[int] = None


class AiChatResponse(BaseModel):
    answer: str


class SummarizeDocumentRequest(BaseModel):
    text: str


class SummarizeDocumentResponse(BaseModel):
    summary: str


@router.post("/chat", response_model=AiChatResponse)
async def chat(
    payload: AiChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    context_parts: list[str] = [f"Роль пользователя в системе: {current_user.role}"]
    if payload.project_id is not None:
        await require_project_access(db, payload.project_id, current_user)
        snapshot = await build_project_ai_context(db, payload.project_id)
        context_parts.append("Снимок текущего проекта (без числовых id):")
        context_parts.append(snapshot)
    context = "\n".join(context_parts)

    if not payload.message.strip():
        raise HTTPException(400, detail="Message is empty")

    answer = await chat_with_ai(payload.message, context=context)
    return AiChatResponse(answer=answer)


@router.post("/summarize-document", response_model=SummarizeDocumentResponse)
async def summarize_document(payload: SummarizeDocumentRequest):
    summary = await summarize_document_text(payload.text)
    return SummarizeDocumentResponse(summary=summary)

