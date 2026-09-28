"""The `purchases` and `purchase_status_history` tables.

Prices are copied onto the purchase at checkout time. That is deliberate: an admin
can change a plan's price later, and revenue reporting must reflect what the
customer actually agreed to pay.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow
from app.models.enums import BillingCycle, PurchaseStatus

# Declared once and shared by every column below so PostgreSQL only ever gets a
# single `purchase_status` / `billing_cycle` enum type.
purchase_status_type = SAEnum(
    PurchaseStatus, name="purchase_status", values_callable=lambda e: [m.value for m in e]
)
billing_cycle_type = SAEnum(
    BillingCycle, name="billing_cycle", values_callable=lambda e: [m.value for m in e]
)
from app.models.plan import Plan
from app.models.user import User


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    status: Mapped[PurchaseStatus] = mapped_column(
        purchase_status_type,
        default=PurchaseStatus.PENDING,
        nullable=False,
        index=True,
    )
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        billing_cycle_type,
        default=BillingCycle.MONTHLY,
        nullable=False,
    )

    # Snapshot of the region + price agreed at checkout.
    state_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

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
    activated_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(back_populates="purchases", foreign_keys=[user_id])
    plan: Mapped[Plan] = relationship(back_populates="purchases", lazy="joined")
    status_history: Mapped[list["PurchaseStatusHistory"]] = relationship(
        back_populates="purchase",
        cascade="all, delete-orphan",
        order_by="PurchaseStatusHistory.created_at",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Purchase {self.id} user={self.user_id} {self.status.value}>"


class PurchaseStatusHistory(Base):
    """Append-only audit trail of every status change on a purchase."""

    __tablename__ = "purchase_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(
        ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Null `from_status` marks the row created when the purchase was submitted.
    from_status: Mapped[PurchaseStatus | None] = mapped_column(purchase_status_type)
    to_status: Mapped[PurchaseStatus] = mapped_column(purchase_status_type, nullable=False)

    changed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        default=utcnow,
        server_default=current_timestamp_6(),
        nullable=False,
    )

    purchase: Mapped[Purchase] = relationship(back_populates="status_history")
    changed_by: Mapped[User | None] = relationship(foreign_keys=[changed_by_user_id])
