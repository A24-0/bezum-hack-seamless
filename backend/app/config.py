from typing import Annotated, Any

from pydantic import BeforeValidator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "on")


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://seamless:seamless@db:5432/seamless"
    SECRET_KEY: str = "supersecretkey"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    OPENAI_API_KEY: str = ""

    # HuggingFace (для бота/ИИ, если OPENAI не задан)
    HUGGINGFACE_API_TOKEN: str = ""
    HUGGINGFACE_MODEL: str = "mistralai/Mistral-7B-Instruct-v0.2"

    # Ollama (локальные модели, бесплатный вариант)
    # В контейнере Docker обычно нужно обращаться к хосту через host.docker.internal.
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "mistral"
    JITSI_DOMAIN: str = "meet.jit.si"
    SEED_DEMO_DATA: Annotated[bool, BeforeValidator(_env_bool)] = False

    # GitLab CI/CD (Merge Requests API + webhooks)
    GITLAB_API_URL: str = "https://gitlab.com/api/v4"
    GITLAB_TOKEN: str = ""
    GITLAB_WEBHOOK_SECRET: str = ""

    # GitHub CI/CD (Pull Requests API + webhooks)
    GITHUB_API_URL: str = "https://api.github.com"
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""

    # File uploads (document attachments: PDF, XML, Office, images…)
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_BYTES: int = 26 * 1024 * 1024

    # CORS (security: don't use wildcard by default)
    # Comma-separated list, e.g. "http://localhost:8080,http://127.0.0.1:8080"
    CORS_ALLOW_ORIGINS: str = "http://localhost:8080,http://127.0.0.1:8080"
    CORS_ALLOW_HEADERS: str = "Authorization,Content-Type"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
