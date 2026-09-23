from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration read from environment variables only (twelve-factor). Loading a .env file is the job of
    whatever starts the process, e.g. `uv run --env-file`, never of the app itself."""

    model_config = SettingsConfigDict(extra="ignore")

    # Set by the build or deploy pipeline (e.g. a git tag or commit SHA); shown in /docs and /health.
    app_version: str = "dev"
    database_url: str = "postgresql+psycopg://richlife:richlife@localhost:5432/richlife"
    # HS256 key; RFC 7518 asks for at least 256 bits.
    jwt_secret: Annotated[SecretStr, Field(min_length=32)]
    # There are no refresh tokens in the MVP, so this is how long a login lasts.
    access_token_expire_minutes: int = 60 * 24 * 7
    # Passkeys are bound to the relying party ID: the domain the web app is served from, without scheme or port.
    # Changing it in production invalidates every registered passkey.
    webauthn_rp_id: str = "localhost"
    # Shown by the browser and the authenticator when a passkey is created.
    webauthn_rp_name: str = "Rich Life"
    # The web app's origin, which the browser reports in every ceremony.
    webauthn_origin: str = "http://localhost:5173"
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
