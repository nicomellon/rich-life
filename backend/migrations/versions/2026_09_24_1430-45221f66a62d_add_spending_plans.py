"""add spending plans

Existing users get the default 50/10/20/20 plan, as new users do at registration.

Revision ID: 45221f66a62d
Revises: 6dce81927a48
Create Date: 2026-09-24 14:30:57.471314

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45221f66a62d"
down_revision: str | Sequence[str] | None = "6dce81927a48"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spending_plans",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "fixed_costs_pct",
            sa.Numeric(precision=5, scale=2),
            server_default="50",
            nullable=False,
        ),
        sa.Column(
            "investments_pct",
            sa.Numeric(precision=5, scale=2),
            server_default="10",
            nullable=False,
        ),
        sa.Column(
            "savings_pct",
            sa.Numeric(precision=5, scale=2),
            server_default="20",
            nullable=False,
        ),
        sa.Column(
            "guilt_free_pct",
            sa.Numeric(precision=5, scale=2),
            server_default="20",
            nullable=False,
        ),
        sa.CheckConstraint(
            "fixed_costs_pct + investments_pct + savings_pct + guilt_free_pct = 100",
            name=op.f("ck_spending_plans_total_pct"),
        ),
        sa.CheckConstraint(
            "fixed_costs_pct >= 0 AND fixed_costs_pct <= 100",
            name=op.f("ck_spending_plans_fixed_costs_pct"),
        ),
        sa.CheckConstraint(
            "guilt_free_pct >= 0 AND guilt_free_pct <= 100",
            name=op.f("ck_spending_plans_guilt_free_pct"),
        ),
        sa.CheckConstraint(
            "investments_pct >= 0 AND investments_pct <= 100",
            name=op.f("ck_spending_plans_investments_pct"),
        ),
        sa.CheckConstraint(
            "savings_pct >= 0 AND savings_pct <= 100",
            name=op.f("ck_spending_plans_savings_pct"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_spending_plans_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_spending_plans")),
    )
    # The server defaults fill in the percentages.
    op.execute("INSERT INTO spending_plans (user_id) SELECT id FROM users")


def downgrade() -> None:
    op.drop_table("spending_plans")
