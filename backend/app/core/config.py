from functools import lru_cache
from typing import Annotated

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration read from environment variables only (twelve-factor). Loading a .env file is the job of
    whatever starts the process, e.g. `uv run --env-file`, never of the app itself."""

    model_config = SettingsConfigDict(extra="ignore")

    # Set by the build or deploy pipeline (e.g. a git tag or commit SHA); shown in /docs and /health.
    app_version: str = "dev"
    database_url: str = "postgresql+psycopg://richlife:richlife@localhost:5432/richlife"
    jwt_secret: SecretStr
    # Comma-separated in the environment, e.g. CORS_ORIGINS=http://localhost:5173,https://app.example.com
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
