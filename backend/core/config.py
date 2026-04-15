from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    EMAIL_ENCRYPTION_KEY: str

    # Optional overrides
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BCRYPT_ROUNDS: int = 12

    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    # Support inbox address — inbound emails to this address auto-create tickets (Req 18.1)
    SUPPORT_EMAIL: str = "support@example.com"


settings = Settings()
