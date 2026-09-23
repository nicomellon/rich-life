# Import every model module here so that `Base.metadata` knows all tables when Alembic autogenerates migrations.
from app.models.user import User

__all__ = ["User"]
