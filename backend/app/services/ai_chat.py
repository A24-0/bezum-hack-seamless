from typing import Optional

import httpx

from app.config import settings
from app.services.ai_guardrails import guard_document_text_for_summary
from app.services.ai_guardrails import guard_user_message


async def chat_with_ai(message: str, context: Optional[str] = None) -> str:
    """
    Generic assistant for the app.
    If OPENAI_API_KEY is configured -> use OpenAI chat completion.
    Otherwise -> safe fallback.
    """

    msg = (message or "").strip()
    if not msg:
        return "Напиши вопрос — и я помогу."

    blocked, refusal = guard_user_message(msg)
    if blocked and refusal:
        return refusal

    lower = msg.lower()
    # Friendly greetings: don't assume the user is asking about documents.
    if any(x in lower for x in ["как дела", "как ты", "привет", "здравств", "добрый день", "здаров"]):
        return "Привет! Чем помочь: документы, встречи, подбор по стеку в кабинете, эпохи или CI/CD?"

    if not settings.OPENAI_API_KEY:
        # 1) Try Ollama first (free/local)
        if settings.OLLAMA_BASE_URL and settings.OLLAMA_BASE_URL.strip() and settings.OLLAMA_MODEL:
            try:
                base = settings.OLLAMA_BASE_URL.rstrip("/")
                url = f"{base}/api/chat"
                system = (
                    "Ты помощник в приложении Seamless. Отвечай на русском, коротко и по делу. "
                    "Если вопрос про навигацию/документы/кабинет — давай конкретные шаги."
                    " Никогда не упоминай числовые идентификаторы (id пользователей/проектов/задач). "
                    "Пиши только 'текущий проект/текущий пользователь' и давай инструкции по разделам. "
                    "Не выдумывай названия кнопок/экранов: если не уверен, назови общий раздел и попроси уточнение. "
                    "Не запрашивай и не повторяй пароли, токены, ключи API, SSH-ключи. "
                    "Если спрашивают про секреты — направь в CI/CD (GitHub Secrets) и менеджер паролей команды."
                )
                full_context = f"\n\nКонтекст пользователя/проекта:\n{context}" if context else ""
                payload = {
                    "model": settings.OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": f"{full_context}\n\nВопрос: {msg}"},
                    ],
                    "stream": False,
                }
                async with httpx.AsyncClient(timeout=120) as client:
                    r = await client.post(url, json=payload)
                    r.raise_for_status()
                    data = r.json() or {}
                content = (
                    (data.get("message") or {}).get("content")
                    or data.get("response")
                    or data.get("text")
                )
                if content:
                    return str(content).strip()
            except Exception:
                # fallback to other providers below
                pass

        # 2) Try HuggingFace
        if settings.HUGGINGFACE_API_TOKEN and settings.HUGGINGFACE_API_TOKEN.strip():
            model = (settings.HUGGINGFACE_MODEL or "").strip()
            if not model:
                model = "mistralai/Mistral-7B-Instruct-v0.2"
            try:
                system = (
                    "Ты помощник в приложении Seamless. Отвечай на русском, коротко и по делу. "
                    "Если вопрос про навигацию или документы — давай конкретные шаги."
                    " Никогда не упоминай числовые идентификаторы (id пользователей/проектов/задач). "
                    "Пиши только 'текущий проект/текущий пользователь' и давай инструкции по разделам. "
                    "Не выдумывай названия кнопок/экранов: если не уверен, назови общий раздел и попроси уточнение. "
                    "Не запрашивай и не повторяй пароли, токены, ключи API. "
                    "Про секреты: GitHub Secrets / переменные окружения на сервере, менеджер паролей команды."
                )
                full_context = f"\n\nКонтекст:\n{context}" if context else ""
                # HF Inference uses a single prompt; for instruction models we keep it simple.
                prompt = f"{system}{full_context}\n\nВопрос: {msg}\n\nОтвет:"
                headers = {"Authorization": f"Bearer {settings.HUGGINGFACE_API_TOKEN}"}
                payload = {
                    "inputs": prompt,
                    "parameters": {"max_new_tokens": 260, "temperature": 0.7, "do_sample": True},
                }
                async with httpx.AsyncClient(timeout=60) as client:
                    r = await client.post(
                        f"https://api-inference.huggingface.co/models/{model}",
                        headers=headers,
                        json=payload,
                    )
                    r.raise_for_status()
                    data = r.json()
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    generated = data[0].get("generated_text") or ""
                    generated = str(generated)
                    if generated.startswith(prompt):
                        return generated[len(prompt) :].strip() or generated.strip()
                    return generated.strip()
                return "AI (HuggingFace) вернул неожиданный формат ответа."
            except Exception:
                # If HF fails, fall back to deterministic hints below.
                pass

        # 3) Deterministic fallback without external calls.
        if "документ" in msg.lower():
            return (
                "По документам: открой раздел `Документы`, выбери документ и посмотри краткую сводку. "
                "Дальше можно перейти к нужной части внутри предпросмотра."
            )
        if "задач" in msg.lower():
            return (
                "По задачам: открой `Канбан` или `Обзор проекта`, выбери статус. "
                "Если нужен подбор по стеку — укажи стек в `Личном кабинете`."
            )
        return "AI пока отвечает в режиме подсказок (настроек ключей не найдено). Зато могу подсказать по навигации."

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        system = (
            "Ты ассистент в приложении Seamless. Отвечай на русском, коротко и по делу. "
            "Если в запросе есть контекст по проекту/документам/стеку — опирайся на него. "
            "Давай практические шаги и, где уместно, подсказывай какие разделы интерфейса открыть. "
            "Никогда не упоминай числовые идентификаторы (id пользователей/проектов/задач). "
            "Пиши только 'текущий проект' и инструкции по разделам. "
            "Не выдумывай названия кнопок/экранов: если не уверен, назови общий раздел и попроси уточнение. "
            "Не запрашивай и не повторяй пароли, токены, ключи API. "
            "Про секреты: GitHub Secrets, переменные окружения на сервере, корпоративный vault/менеджер паролей."
        )
        full_context = f"\n\nКонтекст пользователя/проекта:\n{context}" if context else ""
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"{full_context}\n\nВопрос: {msg}"},
            ],
            max_tokens=500,
        )
        return response.choices[0].message.content or "Не удалось получить ответ от модели."
    except Exception as e:
        return f"AI временно недоступен: {str(e)}"


async def summarize_document_text(text: str) -> str:
    """
    Make an "essence" summary for a document.
    Uses Ollama/HF if available, otherwise deterministic extractive.
    """
    doc_text = (text or "").strip()
    if not doc_text:
        return "Сводка недоступна: документ пуст."

    blocked, refusal = guard_document_text_for_summary(doc_text)
    if blocked and refusal:
        return refusal

    # Keep payload reasonable.
    if len(doc_text) > 8000:
        doc_text = doc_text[:8000]

    system = (
        "Ты помощник по документам в приложении Seamless. "
        "Сформируй краткую СУТЬ документа (не по абзацам), а по смыслу. "
        "Ответ на русском, 4-7 буллетов. "
        "Не упоминай числовые id (id пользователей/проектов/задач)."
    )

    user = f"Документ:\n{doc_text}\n\nСуть документа:"

    # 1) Ollama
    if settings.OLLAMA_BASE_URL and settings.OLLAMA_BASE_URL.strip() and settings.OLLAMA_MODEL:
        try:
            base = settings.OLLAMA_BASE_URL.rstrip("/")
            url = f"{base}/api/chat"
            payload = {
                "model": settings.OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
            }
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
                data = r.json() or {}
            content = (data.get("message") or {}).get("content") or data.get("response") or data.get("text") or ""
            if content:
                return str(content).strip()
        except Exception:
            pass

    # 2) HuggingFace
    if settings.HUGGINGFACE_API_TOKEN and settings.HUGGINGFACE_API_TOKEN.strip():
        try:
            model = (settings.HUGGINGFACE_MODEL or "").strip() or "mistralai/Mistral-7B-Instruct-v0.2"
            headers = {"Authorization": f"Bearer {settings.HUGGINGFACE_API_TOKEN}"}
            prompt = f"{system}\n\n{user}\n\nОтвет:"
            payload = {"inputs": prompt, "parameters": {"max_new_tokens": 320, "temperature": 0.6, "do_sample": True}}
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(f"https://api-inference.huggingface.co/models/{model}", headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
            if isinstance(data, list) and data and isinstance(data[0], dict):
                generated = data[0].get("generated_text") or ""
                return str(generated).strip()
        except Exception:
            pass

    # 3) Deterministic fallback: pick important sentences.
    sentences = [s.strip() for s in doc_text.replace("\n", " ").split(".") if s.strip()]
    keywords = ["цель", "треб", "суть", "задач", "долж", "нужно", "использ", "результ", "scope", "requirement", "action", "критер"]
    scored: list[tuple[int, str]] = []
    for s in sentences:
        lower = s.lower()
        score = sum(1 for k in keywords if k in lower)
        if score > 0:
            scored.append((score, s))
    if not scored:
        # fallback to first chunks
        top = sentences[:6]
    else:
        scored.sort(key=lambda x: x[0], reverse=True)
        top = [s for _, s in scored[:6]]
    bullets = "\n".join([f"• {t}" for t in top if t])
    return bullets if bullets else "Сводка недоступна."

