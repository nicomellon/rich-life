"""add months

Revision ID: 2b918305d5bf
Revises: 45221f66a62d
Create Date: 2026-09-24 16:39:06.778147

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2b918305d5bf"
down_revision: str | Sequence[str] | None = "45221f66a62d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "months",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("income", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("fixed_costs_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("investments_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("savings_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("guilt_free_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "fixed_costs_pct + investments_pct + savings_pct + guilt_free_pct = 100",
            name=op.f("ck_months_total_pct"),
        ),
        sa.CheckConstraint(
            "fixed_costs_pct >= 0 AND fixed_costs_pct <= 100",
            name=op.f("ck_months_fixed_costs_pct"),
        ),
        sa.CheckConstraint(
            "guilt_free_pct >= 0 AND guilt_free_pct <= 100",
            name=op.f("ck_months_guilt_free_pct"),
        ),
        sa.CheckConstraint("income >= 0", name=op.f("ck_months_income")),
        sa.CheckConstraint(
            "investments_pct >= 0 AND investments_pct <= 100",
            name=op.f("ck_months_investments_pct"),
        ),
        sa.CheckConstraint("month >= 1 AND month <= 12", name=op.f("ck_months_month")),
        sa.CheckConstraint(
            "savings_pct >= 0 AND savings_pct <= 100",
            name=op.f("ck_months_savings_pct"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_months_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_months")),
        sa.UniqueConstraint(
            "user_id", "year", "month", name=op.f("uq_months_user_id_year_month")
        ),
    )


def downgrade() -> None:
    op.drop_table("months")
