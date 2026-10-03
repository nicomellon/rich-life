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


def test_email_delivery_defaults_to_log(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EMAIL_DELIVERY", raising=False)

    settings = Settings()

    assert settings.email_delivery == "log"


@pytest.mark.parametrize(
    "email_settings",
    [
        {"EMAIL_FROM": "Rich Life <sign-in@example.com>"},
        {"EMAIL_API_KEY": "re_test_key"},
        {"EMAIL_API_KEY": "", "EMAIL_FROM": "Rich Life <sign-in@example.com>"},
    ],
    ids=["missing-api-key", "missing-sender", "empty-api-key"],
)
def test_resend_email_delivery_needs_an_api_key_and_a_sender(
    monkeypatch: pytest.MonkeyPatch, email_settings: dict[str, str]
) -> None:
    monkeypatch.setenv("EMAIL_DELIVERY", "resend")
    for variable_name, variable_value in email_settings.items():
        monkeypatch.setenv(variable_name, variable_value)

    with pytest.raises(ValidationError, match="EMAIL_API_KEY and EMAIL_FROM"):
        Settings()


def test_resend_email_delivery_starts_with_an_api_key_and_a_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMAIL_DELIVERY", "resend")
    monkeypatch.setenv("EMAIL_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "Rich Life <sign-in@example.com>")

    settings = Settings()

    assert settings.email_delivery == "resend"


@pytest.mark.parametrize(
    ("environment_variable_name", "default_limit"),
    [("MAGIC_LINK_EMAIL_LIMIT", 3), ("MAGIC_LINK_IP_LIMIT", 20)],
    ids=["per-email", "per-ip"],
)
def test_magic_link_rate_limits_have_defaults(
    monkeypatch: pytest.MonkeyPatch, environment_variable_name: str, default_limit: int
) -> None:
    monkeypatch.delenv(environment_variable_name, raising=False)

    settings = Settings()

    assert getattr(settings, environment_variable_name.lower()) == default_limit
