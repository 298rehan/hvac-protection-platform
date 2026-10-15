"""Service orders and their line items.

Everything about price is copied onto the order at checkout (names, unit
prices, add-ons, totals), so changing the catalog later never changes an
existing order. Payment status is tracked separately from order status.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.enums import (
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PreferredWindow,
    PricingType,
    ServiceFrequency,
)
from app.models.user import User


def _enum(enum_cls, name):
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class ServiceOrder(Base):
    __tablename__ = "service_orders"
    # Retrying the same checkout (double click, network retry) returns the same order.
    __table_args__ = (UniqueConstraint("customer_id", "idempotency_key", name="uq_service_orders_idempotency"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    custom_plan_id: Mapped[int | None] = mapped_column(ForeignKey("custom_plans.id", ondelete="SET NULL"))
    ac_unit_id: Mapped[int | None] = mapped_column(ForeignKey("ac_units.id", ondelete="SET NULL"))
    assigned_technician_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[OrderStatus] = mapped_column(
        _enum(OrderStatus, "order_status"), nullable=False, default=OrderStatus.PENDING_CONFIRMATION, index=True
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod, "payment_method"), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        _enum(PaymentStatus, "payment_status"), nullable=False, default=PaymentStatus.PENDING
    )

    # Service address snapshot.
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    zip_code: Mapped[str] = mapped_column(String(10), nullable=False)

    # The customer's requested visit (a request, not a confirmed booking).
    requested_date: Mapped[date] = mapped_column(Date, nullable=False)
    requested_window: Mapped[PreferredWindow] = mapped_column(
        _enum(PreferredWindow, "requested_window"), nullable=False
    )
    customer_notes: Mapped[str | None] = mapped_column(Text)

    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_code: Mapped[str | None] = mapped_column(String(40))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # True while any line still has an estimated ("starting at") price.
    total_is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    status_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, server_default=current_timestamp_6(), nullable=False
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    paid_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    customer: Mapped[User] = relationship(foreign_keys=[customer_id])
    assigned_technician: Mapped[User | None] = relationship(foreign_keys=[assigned_technician_id])
    items: Mapped[list["ServiceOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="ServiceOrderItem.id", lazy="selectin"
    )
    appointments: Mapped[list["Appointment"]] = relationship(  # noqa: F821
        lazy="selectin", order_by="Appointment.start_at"
    )

    @property
    def active_appointment(self):
        from app.models.enums import AppointmentStatus

        return next((a for a in self.appointments if a.status is AppointmentStatus.CONFIRMED), None)


class ServiceOrderItem(Base):
    __tablename__ = "service_order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("service_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Kept for reporting; SET NULL so deleting a catalog service never breaks history.
    service_id: Mapped[int | None] = mapped_column(ForeignKey("hvac_services.id", ondelete="SET NULL"))

    service_name: Mapped[str] = mapped_column(String(120), nullable=False)
    pricing_type: Mapped[PricingType] = mapped_column(_enum(PricingType, "item_pricing_type"), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    frequency: Mapped[ServiceFrequency] = mapped_column(_enum(ServiceFrequency, "item_frequency"), nullable=False)
    # [{"name": "Coil cleaning", "price": "35.00"}]
    addons: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    # STARTING_AT lines: estimated until an admin records the final price.
    is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    order: Mapped[ServiceOrder] = relationship(back_populates="items")
