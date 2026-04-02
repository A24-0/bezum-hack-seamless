"""
Lightweight input guardrails for the AI assistant.
Blocks obvious prompt-injection, secret-harvesting, and unsafe requests.
"""

import re
from typing import Optional

# Patterns (case-insensitive) — refusal without echoing the trigger phrase.
_INJECTION_PATTERNS = (
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"disregard\s+(the\s+)?system",
    r"override\s+(the\s+)?system\s+prompt",
    r"reveal\s+(your\s+)?(system\s+)?prompt",
    r"show\s+(me\s+)?(the\s+)?system\s+message",
    r"jailbreak",
    r"\bdan\b.*mode",
    r"developer\s+mode",
    r"simulate\s+.*unrestricted",
)

_SECRET_HARVEST_PATTERNS = (
    r"\b(api[_-]?key|secret|password|token|private\s+key)\b.*\b(give|send|show|reveal|dump|leak|print)\b",
    r"\b(give|send|show|reveal)\b.*\b(api[_-]?key|github[_-]?token|openai|huggingface)\b",
    r"\bvault\s+password\b",
    r"\bssh[_-]?private\b",
)

_UNSAFE_PATTERNS = (
    r"\b(write|generate|create)\b.*\b(malware|ransomware|exploit\s+kit)\b",
    r"\bhow\s+to\s+(hack|ddos|phish)\b",
)


def _matches_any(text: str, patterns: tuple[str, ...]) -> bool:
    low = text.lower()
    for p in patterns:
        if re.search(p, low, re.IGNORECASE):
            return True
    return False


def _looks_like_pasted_secret(text: str) -> bool:
    t = text.strip()
    if len(t) < 32:
        return False
    # OpenAI-style key
    if re.match(r"^sk-[a-zA-Z0-9]{20,}", t):
        return True
    # Long hex/base64 blobs often pasted by mistake
    if len(t) > 80 and re.match(r"^[A-Za-z0-9+/=\s]+$", t) and t.count(" ") < 3:
        return True
    return False


REFUSAL_GENERIC = (
    "Я не могу помочь с этим запросом. Спроси про навигацию по Seamless, документы, задачи, встречи или CI/CD — "
    "без паролей, токенов и секретов."
)

REFUSAL_SECRETS = (
    "Не обрабатываю и не повторяю секреты (пароли, токены, ключи). "
    "Храни их в менеджере паролей или в секретах CI (GitHub Actions / переменные окружения на сервере)."
)


def guard_user_message(message: str) -> tuple[bool, Optional[str]]:
    """
    Returns (blocked, refusal_message).
    If blocked is True, refusal_message is a safe string to return to the user.
    """
    msg = (message or "").strip()
    if not msg:
        return False, None

    if _looks_like_pasted_secret(msg):
        return True, REFUSAL_SECRETS

    if _matches_any(msg, _INJECTION_PATTERNS):
        return True, REFUSAL_GENERIC

    if _matches_any(msg, _SECRET_HARVEST_PATTERNS):
        return True, REFUSAL_SECRETS

    if _matches_any(msg, _UNSAFE_PATTERNS):
        return True, REFUSAL_GENERIC

    return False, None


def guard_document_text_for_summary(text: str) -> tuple[bool, Optional[str]]:
    """Short-circuit summarization if the text looks like an injection attempt."""
    sample = (text or "")[:4000]
    if _matches_any(sample, _INJECTION_PATTERNS):
        return True, "Сводка недоступна: в тексте обнаружены недопустимые инструкции."
    return False, None
