"""Saved custom plans and the shopping cart (a customer's single CART-kind plan).

Items only reference services; prices are always recalculated from the catalog,
so a saved plan shows today's prices.
"""

from datetime import datetime

from sqlalchemy import JSON, Enum as SAEnum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.catalog import HvacService
from app.models.enums import CustomPlanKind, ServiceFrequency


class CustomPlan(Base):
    __tablename__ = "custom_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[CustomPlanKind] = mapped_column(
        SAEnum(CustomPlanKind, name="custom_plan_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=CustomPlanKind.PLAN,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="My Custom HVAC Plan")
    ac_unit_id: Mapped[int | None] = mapped_column(ForeignKey("ac_units.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, server_default=current_timestamp_6(), nullable=False
    )

    items: Mapped[list["CustomPlanItem"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="CustomPlanItem.id", lazy="selectin"
    )


class CustomPlanItem(Base):
    __tablename__ = "custom_plan_items"
    __table_args__ = (UniqueConstraint("plan_id", "service_id", name="uq_custom_plan_items_service"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("custom_plans.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[int] = mapped_column(ForeignKey("hvac_services.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    frequency: Mapped[ServiceFrequency] = mapped_column(
        SAEnum(ServiceFrequency, name="service_frequency", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=ServiceFrequency.ONE_TIME,
    )
    addon_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)

    plan: Mapped[CustomPlan] = relationship(back_populates="items")
    service: Mapped[HvacService] = relationship(lazy="joined")
