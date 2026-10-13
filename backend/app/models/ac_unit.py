"""The `ac_units` table - a customer's registered air-conditioning equipment."""

from datetime import date, datetime

from sqlalchemy import Date, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.enums import AcType, ReportedCondition
from app.models.purchase import Purchase
from app.models.user import User


class AcUnit(Base):
    __tablename__ = "ac_units"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The plan purchase this unit is covered under. SET NULL keeps the unit (and
    # its service history) if a purchase row is ever removed; a unit can be
    # re-attached to the customer's next plan.
    purchase_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchases.id", ondelete="SET NULL"), index=True
    )

    brand: Mapped[str] = mapped_column(String(80), nullable=False)
    model_number: Mapped[str] = mapped_column(String(80), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(80))
    ac_type: Mapped[AcType] = mapped_column(
        SAEnum(AcType, name="ac_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )

    # Installation address - defaults to the customer's service address in the
    # UI but can differ (e.g. a rental property in the same state).
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    zip_code: Mapped[str] = mapped_column(String(10), nullable=False)

    installation_date: Mapped[date | None] = mapped_column(Date)
    reported_condition: Mapped[ReportedCondition] = mapped_column(
        SAEnum(
            ReportedCondition,
            name="reported_condition",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        onupdate=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )

    customer: Mapped[User] = relationship(foreign_keys=[customer_id])
    purchase: Mapped[Purchase | None] = relationship(foreign_keys=[purchase_id])

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<AcUnit {self.id} {self.brand} {self.model_number} customer={self.customer_id}>"
