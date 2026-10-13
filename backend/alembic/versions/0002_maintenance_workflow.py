"""Maintenance workflow: technicians, AC units, service requests, photos, activity outbox.

Additive only - no existing column is dropped, renamed or narrowed:

* users.role gains TECHNICIAN. The value is appended to the end of the ENUM,
  which MySQL 8 applies in place as a metadata-only change.
* plans gains max_ac_units with a server default of 1, so existing rows are valid.
* Five new tables.

Revision ID: 0002_maintenance_workflow
Revises: 0001_initial
Create Date: 2026-10-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.database.types import UTCDateTime

revision: str = "0002_maintenance_workflow"
down_revision: str | None = "0001_initial"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

OLD_USER_ROLES = ("CUSTOMER", "ADMIN")
NEW_USER_ROLES = ("CUSTOMER", "ADMIN", "TECHNICIAN")
AC_TYPES = (
    "CENTRAL_SPLIT",
    "DUCTLESS_MINI_SPLIT",
    "HEAT_PUMP",
    "PACKAGED",
    "WINDOW",
    "PORTABLE",
    "OTHER",
)
REPORTED_CONDITIONS = ("GOOD", "FAIR", "POOR", "NOT_WORKING", "UNKNOWN")
SERVICE_TYPES = (
    "ROUTINE_MAINTENANCE",
    "NOT_COOLING",
    "NOT_HEATING",
    "WATER_LEAK",
    "STRANGE_NOISE",
    "VISIBLE_DAMAGE",
    "OTHER",
)
SERVICE_REQUEST_STATUSES = (
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "ASSIGNED",
    "INSPECTION_IN_PROGRESS",
    "AWAITING_CUSTOMER_APPROVAL",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
)
PHOTO_CATEGORIES = ("INITIAL", "CUSTOMER", "INSPECTION", "BEFORE", "AFTER")
PHOTO_STATUSES = ("PENDING", "UPLOADED")

NOW6 = sa.text("CURRENT_TIMESTAMP(6)")
TABLE_ARGS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade() -> None:
    # ------------------------------------------------------ users.role
    op.alter_column(
        "users",
        "role",
        existing_type=sa.Enum(*OLD_USER_ROLES, name="user_role"),
        type_=sa.Enum(*NEW_USER_ROLES, name="user_role"),
        existing_nullable=False,
        existing_server_default="CUSTOMER",
    )

    # ------------------------------------------------ plans.max_ac_units
    op.add_column(
        "plans",
        sa.Column("max_ac_units", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )

    # --------------------------------------------------------- ac_units
    op.create_table(
        "ac_units",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=True),
        sa.Column("brand", sa.String(length=80), nullable=False),
        sa.Column("model_number", sa.String(length=80), nullable=False),
        sa.Column("serial_number", sa.String(length=80), nullable=True),
        sa.Column("ac_type", sa.Enum(*AC_TYPES, name="ac_type"), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=2), nullable=False),
        sa.Column("zip_code", sa.String(length=10), nullable=False),
        sa.Column("installation_date", sa.Date(), nullable=True),
        sa.Column(
            "reported_condition",
            sa.Enum(*REPORTED_CONDITIONS, name="reported_condition"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["users.id"], name="fk_ac_units_customer_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["purchase_id"], ["purchases.id"], name="fk_ac_units_purchase_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_ac_units_customer_id", "customer_id"),
        sa.Index("ix_ac_units_purchase_id", "purchase_id"),
        **TABLE_ARGS,
    )

    # -------------------------------------------------- service_requests
    op.create_table(
        "service_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("ac_unit_id", sa.Integer(), nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column("assigned_technician_id", sa.Integer(), nullable=True),
        sa.Column("service_type", sa.Enum(*SERVICE_TYPES, name="service_type"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(*SERVICE_REQUEST_STATUSES, name="service_request_status"),
            nullable=False,
            server_default="SUBMITTED",
        ),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("inspection_findings", sa.Text(), nullable=True),
        sa.Column("proposed_work", sa.Text(), nullable=True),
        sa.Column("work_performed", sa.Text(), nullable=True),
        sa.Column("parts_used", sa.Text(), nullable=True),
        sa.Column("technician_notes", sa.Text(), nullable=True),
        sa.Column("customer_decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("reviewed_at", UTCDateTime(), nullable=True),
        sa.Column("decided_at", UTCDateTime(), nullable=True),
        sa.Column("assigned_at", UTCDateTime(), nullable=True),
        sa.Column("inspection_started_at", UTCDateTime(), nullable=True),
        sa.Column("work_started_at", UTCDateTime(), nullable=True),
        sa.Column("completed_at", UTCDateTime(), nullable=True),
        sa.Column("cancelled_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["users.id"],
            name="fk_service_requests_customer_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ac_unit_id"],
            ["ac_units.id"],
            name="fk_service_requests_ac_unit_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["purchase_id"],
            ["purchases.id"],
            name="fk_service_requests_purchase_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_technician_id"],
            ["users.id"],
            name="fk_service_requests_technician_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_service_requests_customer_id", "customer_id"),
        sa.Index("ix_service_requests_ac_unit_id", "ac_unit_id"),
        sa.Index("ix_service_requests_purchase_id", "purchase_id"),
        sa.Index("ix_service_requests_assigned_technician_id", "assigned_technician_id"),
        sa.Index("ix_service_requests_status", "status"),
        sa.Index("ix_service_requests_created_at", "created_at"),
        **TABLE_ARGS,
    )

    # ------------------------------------------------------------ photos
    op.create_table(
        "photos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("ac_unit_id", sa.Integer(), nullable=True),
        sa.Column("service_request_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.Enum(*PHOTO_CATEGORIES, name="photo_category"), nullable=False),
        sa.Column(
            "status",
            sa.Enum(*PHOTO_STATUSES, name="photo_status"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("s3_key", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("declared_content_type", sa.String(length=100), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("confirmed_at", UTCDateTime(), nullable=True),
        sa.CheckConstraint(
            "(ac_unit_id IS NULL) <> (service_request_id IS NULL)",
            name="ck_photos_single_owner",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["users.id"], name="fk_photos_customer_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["ac_unit_id"], ["ac_units.id"], name="fk_photos_ac_unit_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["service_request_id"],
            ["service_requests.id"],
            name="fk_photos_service_request_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name="fk_photos_uploaded_by",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("s3_key", name="uq_photos_s3_key"),
        sa.Index("ix_photos_customer_id", "customer_id"),
        sa.Index("ix_photos_ac_unit_id", "ac_unit_id"),
        sa.Index("ix_photos_service_request_id", "service_request_id"),
        sa.Index("ix_photos_status", "status"),
        **TABLE_ARGS,
    )

    # --------------------------------------------------- activity_outbox
    op.create_table(
        "activity_outbox",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_attempt_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("delivered_at", UTCDateTime(), nullable=True),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_activity_outbox_event_id"),
        sa.Index("ix_activity_outbox_request_id", "request_id"),
        sa.Index("ix_activity_outbox_pending", "delivered_at", "next_attempt_at"),
        **TABLE_ARGS,
    )


def downgrade() -> None:
    # Refuse rather than silently discard technician accounts: narrowing the
    # ENUM with TECHNICIAN rows present would fail (or truncate) in MySQL.
    bind = op.get_bind()
    technicians = bind.execute(
        sa.text("SELECT COUNT(*) FROM users WHERE role = 'TECHNICIAN'")
    ).scalar()
    if technicians:
        raise RuntimeError(
            f"{technicians} technician account(s) exist. Reassign or remove them before "
            "downgrading past 0002_maintenance_workflow."
        )

    op.drop_table("activity_outbox")
    op.drop_table("photos")
    op.drop_table("service_requests")
    op.drop_table("ac_units")
    op.drop_column("plans", "max_ac_units")
    op.alter_column(
        "users",
        "role",
        existing_type=sa.Enum(*NEW_USER_ROLES, name="user_role"),
        type_=sa.Enum(*OLD_USER_ROLES, name="user_role"),
        existing_nullable=False,
        existing_server_default="CUSTOMER",
    )
