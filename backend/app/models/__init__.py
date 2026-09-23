# Import every model module here so that `Base.metadata` knows all tables when Alembic autogenerates migrations.
from app.models.passkey import ChallengeKind, Passkey, WebAuthnChallenge
from app.models.user import User

__all__ = ["ChallengeKind", "Passkey", "User", "WebAuthnChallenge"]
