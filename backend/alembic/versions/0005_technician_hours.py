"""Technician working hours.

Additive only: technician_profiles gains work_days (JSON, NULL = Monday-Friday)
and work_start / work_end (TIME, defaults 08:00 / 17:00), so existing
technicians get sensible hours without any data change.

Revision ID: 0005_technician_hours
Revises: 0004_service_marketplace
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_technician_hours"
down_revision: str | None = "0004_service_marketplace"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("technician_profiles", sa.Column("work_days", sa.JSON(), nullable=True))
    op.add_column("technician_profiles", sa.Column("work_start", sa.Time(), nullable=False, server_default="08:00:00"))
    op.add_column("technician_profiles", sa.Column("work_end", sa.Time(), nullable=False, server_default="17:00:00"))


def downgrade() -> None:
    op.drop_column("technician_profiles", "work_end")
    op.drop_column("technician_profiles", "work_start")
    op.drop_column("technician_profiles", "work_days")
