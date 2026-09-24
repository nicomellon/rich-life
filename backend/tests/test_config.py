import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_cors_origins_are_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, https://app.example.com")

    settings = Settings()

    assert settings.cors_origins == ["http://localhost:5173", "https://app.example.com"]


def test_jwt_secret_must_be_at_least_32_characters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("JWT_SECRET", "too-short")

    with pytest.raises(ValidationError, match="jwt_secret"):
        Settings()
