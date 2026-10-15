"""Service catalog: categories, individual HVAC services, add-ons and discount codes.

Prices live only here (and are copied onto orders at checkout), so the
frontends never decide what anything costs.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.enums import DiscountType, PricingType


class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Name of an icon the frontends know how to draw, e.g. "snowflake".
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="wrench")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    services: Mapped[list["HvacService"]] = relationship(
        back_populates="category", order_by="HvacService.display_order"
    )


class HvacService(Base):
    __tablename__ = "hvac_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("service_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="wrench")
    image_url: Mapped[str | None] = mapped_column(String(500))

    pricing_type: Mapped[PricingType] = mapped_column(
        SAEnum(PricingType, name="pricing_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Label for PER_UNIT pricing, e.g. "filter".
    unit_label: Mapped[str | None] = mapped_column(String(40))
    max_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    # ServiceFrequency values this service can be ordered at, e.g. ["ONE_TIME", "QUARTERLY"].
    allowed_frequencies: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # Two-letter states where it is offered. NULL = everywhere the business operates.
    available_states: Mapped[list[str] | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, server_default=current_timestamp_6(), nullable=False
    )

    category: Mapped[ServiceCategory] = relationship(back_populates="services", lazy="joined")
    addons: Mapped[list["ServiceAddon"]] = relationship(
        back_populates="service", order_by="ServiceAddon.id", lazy="selectin", cascade="all, delete-orphan"
    )

    @property
    def requires_inspection(self) -> bool:
        return self.pricing_type is PricingType.STARTING_AT


class ServiceAddon(Base):
    """Optional extra for one service, e.g. "Coil cleaning" on an AC tune-up."""

    __tablename__ = "service_addons"

    id: Mapped[int] = mapped_column(primary_key=True)
    service_id: Mapped[int] = mapped_column(
        ForeignKey("hvac_services.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    service: Mapped[HvacService] = relationship(back_populates="addons")


class DiscountCode(Base):
    __tablename__ = "discount_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored upper-case; customers may type it in any case.
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    discount_type: Mapped[DiscountType] = mapped_column(
        SAEnum(DiscountType, name="discount_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    # Percent (e.g. 10.00) or a fixed amount, depending on discount_type.
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    max_uses: Mapped[int | None] = mapped_column(Integer)
    times_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
