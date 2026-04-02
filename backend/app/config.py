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
    JITSI_DOMAIN: str = "meet.jit.si"
    SEED_DEMO_DATA: Annotated[bool, BeforeValidator(_env_bool)] = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
