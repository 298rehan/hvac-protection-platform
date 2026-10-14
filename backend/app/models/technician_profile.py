"""The `technician_profiles` table - where a technician works and what they specialise in.

One row per technician (users.role = TECHNICIAN). Used to match a claim's
property location to the technicians who serve it.
"""

from datetime import datetime

from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.user import User


class TechnicianProfile(Base):
    __tablename__ = "technician_profiles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Two-letter state codes the technician serves, e.g. ["TX"].
    service_states: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # Optional ZIP prefixes narrowing the area, e.g. ["770", "77494"]. Empty = whole state.
    service_zip_prefixes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # AcType values the technician specialises in. Empty = general HVAC.
    specialties: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        onupdate=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )

    user: Mapped[User] = relationship()
