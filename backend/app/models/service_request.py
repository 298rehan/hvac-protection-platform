"""The `service_requests` table - one repair / maintenance job for one AC unit.

The current status and the technician's report live here in MySQL. The full
activity trail (who did what, when) is written to DynamoDB through the
`activity_outbox` table - see `app.services.activity`.
"""

from datetime import datetime

from sqlalchemy import JSON, Enum as SAEnum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.ac_unit import AcUnit
from app.models.enums import ServiceRequestStatus, ServiceType
from app.models.purchase import Purchase
from app.models.user import User

service_request_status_type = SAEnum(
    ServiceRequestStatus,
    name="service_request_status",
    values_callable=lambda e: [m.value for m in e],
)


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ac_unit_id: Mapped[int] = mapped_column(
        ForeignKey("ac_units.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # The active plan the request was submitted under.
    purchase_id: Mapped[int] = mapped_column(
        ForeignKey("purchases.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_technician_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    service_type: Mapped[ServiceType] = mapped_column(
        SAEnum(ServiceType, name="service_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ServiceRequestStatus] = mapped_column(
        service_request_status_type,
        default=ServiceRequestStatus.SUBMITTED,
        nullable=False,
        index=True,
    )
    # Why it was rejected or cancelled. Shown to the customer.
    status_reason: Mapped[str | None] = mapped_column(Text)

    # --- Technician report --------------------------------------------------
    inspection_findings: Mapped[str | None] = mapped_column(Text)
    # Work that needs the customer's go-ahead (AWAITING_CUSTOMER_APPROVAL).
    proposed_work: Mapped[str | None] = mapped_column(Text)
    work_performed: Mapped[str | None] = mapped_column(Text)
    parts_used: Mapped[str | None] = mapped_column(Text)
    # Staff-only notes; never shown to the customer.
    technician_notes: Mapped[str | None] = mapped_column(Text)
    customer_decision_note: Mapped[str | None] = mapped_column(Text)

    # Customer's preferred visit windows: [{"date": "2026-10-20", "window": "MORNING"}].
    # Preferences only - a confirmed visit is an Appointment row.
    preferred_windows: Mapped[list[dict] | None] = mapped_column(JSON)
    # "More information required" exchange (latest round; full trail in the activity log).
    info_request_note: Mapped[str | None] = mapped_column(Text)
    info_response_note: Mapped[str | None] = mapped_column(Text)

    # --- Lifecycle timestamps ----------------------------------------------
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        onupdate=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    assigned_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    inspection_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    work_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    customer: Mapped[User] = relationship(foreign_keys=[customer_id])
    assigned_technician: Mapped[User | None] = relationship(foreign_keys=[assigned_technician_id])
    ac_unit: Mapped[AcUnit] = relationship(foreign_keys=[ac_unit_id], lazy="joined")
    purchase: Mapped[Purchase] = relationship(foreign_keys=[purchase_id])
    appointments: Mapped[list["Appointment"]] = relationship(  # noqa: F821
        lazy="selectin", order_by="Appointment.start_at"
    )

    @property
    def active_appointment(self) -> "Appointment | None":  # noqa: F821
        from app.models.enums import AppointmentStatus

        return next((a for a in self.appointments if a.status is AppointmentStatus.CONFIRMED), None)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<ServiceRequest {self.id} {self.status.value}>"
