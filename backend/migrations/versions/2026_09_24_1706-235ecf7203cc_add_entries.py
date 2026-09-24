"""add entries

Revision ID: 235ecf7203cc
Revises: 2b918305d5bf
Create Date: 2026-09-24 17:06:15.278533

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "235ecf7203cc"
down_revision: str | Sequence[str] | None = "2b918305d5bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("month_id", sa.Integer(), nullable=False),
        sa.Column(
            "bucket",
            sa.Enum(
                "fixed_costs",
                "investments",
                "savings",
                "guilt_free",
                name="bucket",
                native_enum=False,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "description", sa.String(length=255), server_default="", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_entries_amount")),
        sa.ForeignKeyConstraint(
            ["month_id"],
            ["months.id"],
            name=op.f("fk_entries_month_id_months"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_entries_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entries")),
    )
    op.create_index(op.f("ix_entries_month_id"), "entries", ["month_id"], unique=False)
    op.create_index(op.f("ix_entries_user_id"), "entries", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_entries_user_id"), table_name="entries")
    op.drop_index(op.f("ix_entries_month_id"), table_name="entries")
    op.drop_table("entries")
