from functools import lru_cache
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration read from environment variables only (twelve-factor). Loading a
    .env file is the job of whatever starts the process, e.g. `uv run --env-file`,
    never of the app itself."""

    model_config = SettingsConfigDict(extra="ignore")

    # Set by the build or deploy pipeline (e.g. a git tag or commit SHA); shown in /docs
    # and /health.
    app_version: str = "dev"
    database_url: str = "postgresql+psycopg://richlife:richlife@localhost:5432/richlife"
    # HS256 key; RFC 7518 asks for at least 256 bits.
    jwt_secret: Annotated[SecretStr, Field(min_length=32)]
    # There are no refresh tokens in the MVP, so this is how long a login lasts.
    access_token_expire_minutes: int = 60 * 24 * 7
    # Passkeys are bound to the relying party ID: the domain the web app is served from,
    # without scheme or port. Changing it in production invalidates every registered
    # passkey.
    webauthn_rp_id: str = "localhost"
    # Shown by the browser and the authenticator when a passkey is created.
    webauthn_rp_name: str = "Rich Life"
    # The web app's origin, which the browser reports in every ceremony.
    webauthn_origin: str = "http://localhost:5173"
    # Comma-separated in the environment, e.g. CORS_ORIGINS=http://localhost:5173,https://app.example.com
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # Holds the magic-link tokens and the rate-limit counters.
    redis_url: str = "redis://localhost:6379/0"
    # How sign-in links reach users: `log` writes them to the log (development),
    # `resend` emails them through Resend's API.
    email_delivery: Literal["log", "resend"] = "log"
    # Resend's API key and the sender, e.g. "Rich Life <sign-in@example.com>". Both are
    # required with `resend`.
    email_api_key: SecretStr | None = None
    email_from: str | None = None
    # How many sign-in links one email address, and one client IP, may ask for in a
    # rolling 15 minutes. The IP limit also applies to redeeming links.
    magic_link_email_limit: Annotated[int, Field(ge=1)] = 3
    magic_link_ip_limit: Annotated[int, Field(ge=1)] = 20

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, raw_cors_origins: object) -> object:
        if isinstance(raw_cors_origins, str):
            origins = raw_cors_origins.split(",")
            return [origin.strip() for origin in origins if origin.strip()]
        return raw_cors_origins

    @model_validator(mode="after")
    def require_resend_credentials(self) -> Self:
        """Refuse to start when links would be emailed without a key or a sender."""
        if self.email_delivery == "resend" and not (
            self.email_api_key
            and self.email_api_key.get_secret_value()
            and self.email_from
        ):
            raise ValueError(
                "EMAIL_DELIVERY=resend needs EMAIL_API_KEY and EMAIL_FROM to be set"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
