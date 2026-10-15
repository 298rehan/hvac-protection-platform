"""Service marketplace: catalog, custom plans / cart, orders; appointments for orders.

Additive only:
* New tables: service_categories, hvac_services, service_addons, discount_codes,
  custom_plans, custom_plan_items, service_orders, service_order_items.
* appointments.service_request_id becomes nullable and appointments gains
  service_order_id, so one appointments table (and one conflict check) covers
  both claims and orders. Existing rows all keep their service_request_id.

Revision ID: 0004_service_marketplace
Revises: 0003_claims_scheduling
Create Date: 2026-10-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.database.types import UTCDateTime

revision: str = "0004_service_marketplace"
down_revision: str | None = "0003_claims_scheduling"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

NOW6 = sa.text("CURRENT_TIMESTAMP(6)")
TABLE_ARGS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}
PRICING = ("FIXED", "STARTING_AT", "PER_UNIT")
FREQUENCIES = ("ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY")
ORDER_STATUSES = ("PENDING_CONFIRMATION", "CONFIRMED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED")
WINDOWS = ("MORNING", "AFTERNOON", "EVENING")
MONEY = sa.Numeric(precision=10, scale=2)


def upgrade() -> None:
    op.create_table(
        "service_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(40), nullable=False, server_default="wrench"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_service_categories_name"),
        sa.Index("ix_service_categories_slug", "slug", unique=True),
        **TABLE_ARGS,
    )
    op.create_table(
        "hvac_services",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(40), nullable=False, server_default="wrench"),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("pricing_type", sa.Enum(*PRICING, name="pricing_type"), nullable=False),
        sa.Column("price", MONEY, nullable=False),
        sa.Column("unit_label", sa.String(40), nullable=True),
        sa.Column("max_quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default=sa.text("60")),
        sa.Column("allowed_frequencies", sa.JSON(), nullable=False),
        sa.Column("available_states", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["service_categories.id"], name="fk_hvac_services_category_id", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_hvac_services_name"),
        sa.Index("ix_hvac_services_slug", "slug", unique=True),
        sa.Index("ix_hvac_services_category_id", "category_id"),
        sa.Index("ix_hvac_services_is_active", "is_active"),
        **TABLE_ARGS,
    )
    op.create_table(
        "service_addons",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("price", MONEY, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["service_id"], ["hvac_services.id"], name="fk_service_addons_service_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_service_addons_service_id", "service_id"),
        **TABLE_ARGS,
    )
    op.create_table(
        "discount_codes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("discount_type", sa.Enum("PERCENT", "AMOUNT", name="discount_type"), nullable=False),
        sa.Column("value", MONEY, nullable=False),
        sa.Column("min_subtotal", MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("times_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("expires_at", UTCDateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_discount_codes_code"),
        **TABLE_ARGS,
    )
    op.create_table(
        "custom_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Enum("PLAN", "CART", name="custom_plan_kind"), nullable=False, server_default="PLAN"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("ac_unit_id", sa.Integer(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], name="fk_custom_plans_customer_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ac_unit_id"], ["ac_units.id"], name="fk_custom_plans_ac_unit_id", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_custom_plans_customer_id", "customer_id"),
        **TABLE_ARGS,
    )
    op.create_table(
        "custom_plan_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("frequency", sa.Enum(*FREQUENCIES, name="service_frequency"), nullable=False, server_default="ONE_TIME"),
        sa.Column("addon_ids", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["custom_plans.id"], name="fk_custom_plan_items_plan_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["hvac_services.id"], name="fk_custom_plan_items_service_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "service_id", name="uq_custom_plan_items_service"),
        **TABLE_ARGS,
    )
    op.create_table(
        "service_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("custom_plan_id", sa.Integer(), nullable=True),
        sa.Column("ac_unit_id", sa.Integer(), nullable=True),
        sa.Column("assigned_technician_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.Enum(*ORDER_STATUSES, name="order_status"), nullable=False, server_default="PENDING_CONFIRMATION"),
        sa.Column("payment_method", sa.Enum("PAY_ON_SERVICE", name="payment_method"), nullable=False),
        sa.Column("payment_status", sa.Enum("PENDING", "PAID", "VOID", name="payment_status"), nullable=False, server_default="PENDING"),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("state", sa.String(2), nullable=False),
        sa.Column("zip_code", sa.String(10), nullable=False),
        sa.Column("requested_date", sa.Date(), nullable=False),
        sa.Column("requested_window", sa.Enum(*WINDOWS, name="requested_window"), nullable=False),
        sa.Column("customer_notes", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("subtotal", MONEY, nullable=False),
        sa.Column("discount_code", sa.String(40), nullable=True),
        sa.Column("discount_amount", MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("tax_amount", MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("fee_amount", MONEY, nullable=False, server_default=sa.text("0")),
        sa.Column("total", MONEY, nullable=False),
        sa.Column("total_is_estimate", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("confirmed_at", UTCDateTime(), nullable=True),
        sa.Column("completed_at", UTCDateTime(), nullable=True),
        sa.Column("cancelled_at", UTCDateTime(), nullable=True),
        sa.Column("paid_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], name="fk_service_orders_customer_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["custom_plan_id"], ["custom_plans.id"], name="fk_service_orders_custom_plan_id", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ac_unit_id"], ["ac_units.id"], name="fk_service_orders_ac_unit_id", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_technician_id"], ["users.id"], name="fk_service_orders_technician_id", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "idempotency_key", name="uq_service_orders_idempotency"),
        sa.Index("ix_service_orders_customer_id", "customer_id"),
        sa.Index("ix_service_orders_assigned_technician_id", "assigned_technician_id"),
        sa.Index("ix_service_orders_status", "status"),
        sa.Index("ix_service_orders_created_at", "created_at"),
        **TABLE_ARGS,
    )
    op.create_table(
        "service_order_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=True),
        sa.Column("service_name", sa.String(120), nullable=False),
        sa.Column("pricing_type", sa.Enum(*PRICING, name="item_pricing_type"), nullable=False),
        sa.Column("unit_price", MONEY, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("frequency", sa.Enum(*FREQUENCIES, name="item_frequency"), nullable=False),
        sa.Column("addons", sa.JSON(), nullable=False),
        sa.Column("line_total", MONEY, nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("is_estimate", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["order_id"], ["service_orders.id"], name="fk_service_order_items_order_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["hvac_services.id"], name="fk_service_order_items_service_id", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_service_order_items_order_id", "order_id"),
        **TABLE_ARGS,
    )

    # Appointments can now belong to an order instead of a claim.
    op.alter_column("appointments", "service_request_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("appointments", sa.Column("service_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_appointments_service_order_id", "appointments", "service_orders",
                          ["service_order_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_appointments_service_order_id", "appointments", ["service_order_id"])
    op.create_check_constraint(
        "ck_appointments_single_owner", "appointments",
        "(service_request_id IS NULL) <> (service_order_id IS NULL)",
    )


def downgrade() -> None:
    bind = op.get_bind()
    orders = bind.execute(sa.text("SELECT COUNT(*) FROM service_orders")).scalar()
    if orders:
        raise RuntimeError(f"{orders} service order(s) exist. Export them before downgrading past 0004.")
    op.drop_constraint("ck_appointments_single_owner", "appointments", type_="check")
    op.drop_constraint("fk_appointments_service_order_id", "appointments", type_="foreignkey")
    op.drop_index("ix_appointments_service_order_id", table_name="appointments")
    op.drop_column("appointments", "service_order_id")
    op.alter_column("appointments", "service_request_id", existing_type=sa.Integer(), nullable=False)
    for table in ("service_order_items", "service_orders", "custom_plan_items", "custom_plans",
                  "discount_codes", "service_addons", "hvac_services", "service_categories"):
        op.drop_table(table)
