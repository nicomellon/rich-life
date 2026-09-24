from datetime import datetime
from typing import ClassVar

from sqlalchemy import DateTime, MetaData
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeEngine

# Deterministic constraint names, so Alembic can autogenerate migrations that alter or
# drop them.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for all models. Alembic autogenerates migrations from
    `Base.metadata`."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # Store every `Mapped[datetime]` as a timezone-aware timestamp.
    type_annotation_map: ClassVar[dict[type, TypeEngine[datetime]]] = {
        datetime: DateTime(timezone=True)
    }
