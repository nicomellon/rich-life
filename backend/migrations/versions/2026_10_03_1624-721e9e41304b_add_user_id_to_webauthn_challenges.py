"""add user_id to webauthn challenges

Revision ID: 721e9e41304b
Revises: 235ecf7203cc
Create Date: 2026-10-03 16:24:54.735179

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "721e9e41304b"
down_revision: str | Sequence[str] | None = "235ecf7203cc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "webauthn_challenges", sa.Column("user_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_webauthn_challenges_user_id_users"),
        "webauthn_challenges",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_webauthn_challenges_user_id_users"),
        "webauthn_challenges",
        type_="foreignkey",
    )
    op.drop_column("webauthn_challenges", "user_id")
