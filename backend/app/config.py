from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://seamless:seamless@db:5432/seamless"
    SECRET_KEY: str = "supersecretkey"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    OPENAI_API_KEY: str = ""
    JITSI_DOMAIN: str = "meet.jit.si"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
