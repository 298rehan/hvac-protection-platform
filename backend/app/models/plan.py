"""The `plans` and `plan_regions` tables.

A plan carries a base price. `plan_regions` both (a) declares which US states the
plan is sold in and (b) overrides the price for that state. A plan with no region
rows is not purchasable anywhere.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
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


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Ordered list of bullet points shown on the plan card, e.g.
    # ["Annual HVAC inspection", "Filter replacement"].
    features: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Fallback pricing, used when a region row does not override it.
    base_monthly_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    base_annual_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        onupdate=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )

    regions: Mapped[list["PlanRegion"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanRegion.state_code",
        lazy="selectin",
    )
    purchases: Mapped[list["Purchase"]] = relationship(back_populates="plan")  # noqa: F821

    def region_for(self, state_code: str | None) -> "PlanRegion | None":
        """Return this plan's pricing row for a state, if the plan is sold there."""
        if not state_code:
            return None
        target = state_code.upper()
        return next((r for r in self.regions if r.state_code == target), None)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Plan {self.id} {self.name}>"


class PlanRegion(Base):
    __tablename__ = "plan_regions"
    __table_args__ = (
        UniqueConstraint("plan_id", "state_code", name="uq_plan_regions_plan_state"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)

    monthly_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    annual_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # Lets an admin pull a plan out of one state without deleting its pricing.
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )

    plan: Mapped[Plan] = relationship(back_populates="regions")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<PlanRegion plan={self.plan_id} {self.state_code} ${self.monthly_price}>"
