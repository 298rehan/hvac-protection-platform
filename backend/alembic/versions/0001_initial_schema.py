"""Initial schema: users, plans, plan_regions, purchases, purchase_status_history.

Targets MySQL 8 (InnoDB / utf8mb4).

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.database.types import UTCDateTime

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# MySQL stores enums inline on the column rather than as a shared named type,
# so these are plain SQLAlchemy Enums re-declared per column.
USER_ROLES = ("CUSTOMER", "ADMIN")
PURCHASE_STATUSES = ("PENDING", "ACTIVE", "CANCELLED", "EXPIRED")
BILLING_CYCLES = ("MONTHLY", "ANNUAL")

# MySQL requires a DEFAULT on a fractional-second column to declare the same
# precision as the column itself.
NOW6 = sa.text("CURRENT_TIMESTAMP(6)")

# InnoDB is required for foreign keys; utf8mb4 is the MySQL 8 default but is
# stated explicitly so the schema does not depend on server configuration.
TABLE_ARGS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade() -> None:
    # ---------------------------------------------------------------- users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("first_name", sa.String(length=80), nullable=False),
        sa.Column("last_name", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(*USER_ROLES, name="user_role"),
            nullable=False,
            server_default="CUSTOMER",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
        sa.Column("zip_code", sa.String(length=10), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_users_email", "email", unique=True),
        sa.Index("ix_users_role", "role"),
        sa.Index("ix_users_state", "state"),
        **TABLE_ARGS,
    )

    # ---------------------------------------------------------------- plans
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        # TEXT and JSON columns cannot carry a DEFAULT in MySQL; both are filled
        # in by the ORM's Python-side defaults instead.
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("base_monthly_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("base_annual_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.Index("ix_plans_slug", "slug", unique=True),
        sa.Index("ix_plans_is_active", "is_active"),
        **TABLE_ARGS,
    )

    # -------------------------------------------------------- plan_regions
    op.create_table(
        "plan_regions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("state_code", sa.String(length=2), nullable=False),
        sa.Column("monthly_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("annual_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["plans.id"], name="fk_plan_regions_plan_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "state_code", name="uq_plan_regions_plan_state"),
        sa.Index("ix_plan_regions_plan_id", "plan_id"),
        sa.Index("ix_plan_regions_state_code", "state_code"),
        **TABLE_ARGS,
    )

    # ------------------------------------------------------------ purchases
    op.create_table(
        "purchases",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(*PURCHASE_STATUSES, name="purchase_status"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "billing_cycle",
            sa.Enum(*BILLING_CYCLES, name="billing_cycle"),
            nullable=False,
            server_default="MONTHLY",
        ),
        sa.Column("state_code", sa.String(length=2), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("activated_at", UTCDateTime(), nullable=True),
        sa.Column("cancelled_at", UTCDateTime(), nullable=True),
        sa.Column("expires_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_purchases_user_id", ondelete="CASCADE"
        ),
        # RESTRICT: a plan that has been sold cannot be deleted out from under
        # its purchase records.
        sa.ForeignKeyConstraint(
            ["plan_id"], ["plans.id"], name="fk_purchases_plan_id", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_purchases_user_id", "user_id"),
        sa.Index("ix_purchases_plan_id", "plan_id"),
        sa.Index("ix_purchases_status", "status"),
        sa.Index("ix_purchases_state_code", "state_code"),
        sa.Index("ix_purchases_created_at", "created_at"),
        **TABLE_ARGS,
    )

    # ---------------------------------------------- purchase_status_history
    op.create_table(
        "purchase_status_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column(
            "from_status", sa.Enum(*PURCHASE_STATUSES, name="purchase_status"), nullable=True
        ),
        sa.Column(
            "to_status", sa.Enum(*PURCHASE_STATUSES, name="purchase_status"), nullable=False
        ),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(
            ["purchase_id"],
            ["purchases.id"],
            name="fk_purchase_status_history_purchase_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by_user_id"],
            ["users.id"],
            name="fk_purchase_status_history_changed_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_purchase_status_history_purchase_id", "purchase_id"),
        **TABLE_ARGS,
    )


def downgrade() -> None:
    # Tables are dropped in reverse dependency order. Their indexes go with
    # them - dropping an index separately would fail on MySQL where that index
    # is the one backing a foreign key.
    op.drop_table("purchase_status_history")
    op.drop_table("purchases")
    op.drop_table("plan_regions")
    op.drop_table("plans")
    op.drop_table("users")
