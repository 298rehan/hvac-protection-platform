"""The `appointments` table - a confirmed technician visit for a claim.

Times are stored in UTC. `timezone` is the property's IANA zone, used to show
the visit in local time. Only CONFIRMED appointments block a technician's time.
"""

from datetime import datetime

from sqlalchemy import Enum as SAEnum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.enums import AppointmentStatus
from app.models.user import User


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_technician_time", "technician_id", "start_at", "end_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    service_request_id: Mapped[int] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    technician_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        SAEnum(
            AppointmentStatus,
            name="appointment_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=AppointmentStatus.CONFIRMED,
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    technician: Mapped[User] = relationship(foreign_keys=[technician_id])
