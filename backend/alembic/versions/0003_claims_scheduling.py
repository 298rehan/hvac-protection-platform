"""Claims workflow: coverage rules, more-info status, preferred windows, technician areas, appointments.

Additive only:
* ENUM values appended (in-place in MySQL 8): ac_type FURNACE; service_type
  SYSTEM_NOT_STARTING, THERMOSTAT_ISSUE; service_request_status NEEDS_INFO, SCHEDULED.
* New nullable columns on plans and service_requests (existing rows unaffected).
* New tables technician_profiles and appointments.

Revision ID: 0003_claims_scheduling
Revises: 0002_maintenance_workflow
Create Date: 2026-10-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.database.types import UTCDateTime

revision: str = "0003_claims_scheduling"
down_revision: str | None = "0002_maintenance_workflow"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

AC_TYPES_OLD = ("CENTRAL_SPLIT", "DUCTLESS_MINI_SPLIT", "HEAT_PUMP", "PACKAGED", "WINDOW", "PORTABLE", "OTHER")
AC_TYPES_NEW = AC_TYPES_OLD + ("FURNACE",)
SERVICE_TYPES_OLD = (
    "ROUTINE_MAINTENANCE", "NOT_COOLING", "NOT_HEATING", "WATER_LEAK",
    "STRANGE_NOISE", "VISIBLE_DAMAGE", "OTHER",
)
SERVICE_TYPES_NEW = SERVICE_TYPES_OLD + ("SYSTEM_NOT_STARTING", "THERMOSTAT_ISSUE")
STATUSES_OLD = (
    "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ASSIGNED",
    "INSPECTION_IN_PROGRESS", "AWAITING_CUSTOMER_APPROVAL", "IN_PROGRESS", "COMPLETED", "CANCELLED",
)
STATUSES_NEW = STATUSES_OLD + ("NEEDS_INFO", "SCHEDULED")

NOW6 = sa.text("CURRENT_TIMESTAMP(6)")
TABLE_ARGS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def _enum(table, column, old, new, name, **kwargs):
    op.alter_column(
        table, column,
        existing_type=sa.Enum(*old, name=name),
        type_=sa.Enum(*new, name=name),
        existing_nullable=False,
        **kwargs,
    )


def upgrade() -> None:
    _enum("ac_units", "ac_type", AC_TYPES_OLD, AC_TYPES_NEW, "ac_type")
    _enum("service_requests", "service_type", SERVICE_TYPES_OLD, SERVICE_TYPES_NEW, "service_type")
    _enum("service_requests", "status", STATUSES_OLD, STATUSES_NEW, "service_request_status",
          existing_server_default="SUBMITTED")

    op.add_column("plans", sa.Column("covered_ac_types", sa.JSON(), nullable=True))
    op.add_column("plans", sa.Column("covered_service_types", sa.JSON(), nullable=True))

    op.add_column("service_requests", sa.Column("preferred_windows", sa.JSON(), nullable=True))
    op.add_column("service_requests", sa.Column("info_request_note", sa.Text(), nullable=True))
    op.add_column("service_requests", sa.Column("info_response_note", sa.Text(), nullable=True))

    op.create_table(
        "technician_profiles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("service_states", sa.JSON(), nullable=False),
        sa.Column("service_zip_prefixes", sa.JSON(), nullable=False),
        sa.Column("specialties", sa.JSON(), nullable=False),
        sa.Column("updated_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_technician_profiles_user_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id"),
        **TABLE_ARGS,
    )

    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("service_request_id", sa.Integer(), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("start_at", UTCDateTime(), nullable=False),
        sa.Column("end_at", UTCDateTime(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum("CONFIRMED", "CANCELLED", name="appointment_status"),
            nullable=False,
            server_default="CONFIRMED",
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", UTCDateTime(), server_default=NOW6, nullable=False),
        sa.Column("cancelled_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["service_request_id"], ["service_requests.id"],
            name="fk_appointments_service_request_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["technician_id"], ["users.id"], name="fk_appointments_technician_id", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], name="fk_appointments_created_by", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_appointments_service_request_id", "service_request_id"),
        sa.Index("ix_appointments_status", "status"),
        sa.Index("ix_appointments_technician_time", "technician_id", "start_at", "end_at"),
        **TABLE_ARGS,
    )


def downgrade() -> None:
    # Refuse rather than silently lose data that only the new ENUM values can hold.
    bind = op.get_bind()
    checks = {
        "service requests in NEEDS_INFO/SCHEDULED": "SELECT COUNT(*) FROM service_requests WHERE status IN ('NEEDS_INFO','SCHEDULED')",
        "service requests with new issue types": "SELECT COUNT(*) FROM service_requests WHERE service_type IN ('SYSTEM_NOT_STARTING','THERMOSTAT_ISSUE')",
        "FURNACE AC units": "SELECT COUNT(*) FROM ac_units WHERE ac_type = 'FURNACE'",
    }
    for label, sql in checks.items():
        count = bind.execute(sa.text(sql)).scalar()
        if count:
            raise RuntimeError(f"{count} {label} exist. Resolve them before downgrading past 0003.")

    op.drop_table("appointments")
    op.drop_table("technician_profiles")
    op.drop_column("service_requests", "info_response_note")
    op.drop_column("service_requests", "info_request_note")
    op.drop_column("service_requests", "preferred_windows")
    op.drop_column("plans", "covered_service_types")
    op.drop_column("plans", "covered_ac_types")
    _enum("service_requests", "status", STATUSES_NEW, STATUSES_OLD, "service_request_status",
          existing_server_default="SUBMITTED")
    _enum("service_requests", "service_type", SERVICE_TYPES_NEW, SERVICE_TYPES_OLD, "service_type")
    _enum("ac_units", "ac_type", AC_TYPES_NEW, AC_TYPES_OLD, "ac_type")
