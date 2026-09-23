import pytest

from app.core.config import Settings


def test_cors_origins_are_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, https://app.example.com")

    settings = Settings()

    assert settings.cors_origins == ["http://localhost:5173", "https://app.example.com"]
