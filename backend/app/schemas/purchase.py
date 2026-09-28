"""Purchase (order) schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import BillingCycle, PurchaseStatus
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class PurchaseCreate(BaseModel):
    """Demo checkout payload. No card details are collected or stored."""

    plan_id: int = Field(gt=0)
    billing_cycle: BillingCycle = BillingCycle.MONTHLY


class PurchaseStatusUpdate(BaseModel):
    status: PurchaseStatus
    note: str | None = Field(default=None, max_length=500)


class PurchasePlanRef(ORMModel):
    """Just enough plan detail to render a purchase row."""

    id: int
    name: str
    slug: str
    description: str
    features: list[str]


class PurchaseStatusHistoryOut(ORMModel):
    id: int
    from_status: PurchaseStatus | None
    to_status: PurchaseStatus
    note: str | None
    created_at: datetime


class PurchaseOut(ORMModel):
    id: int
    user_id: int
    plan_id: int
    status: PurchaseStatus
    billing_cycle: BillingCycle
    state_code: str
    price: Decimal
    created_at: datetime
    activated_at: datetime | None
    cancelled_at: datetime | None
    expires_at: datetime | None
    plan: PurchasePlanRef


class PurchaseDetailOut(PurchaseOut):
    """Adds the audit trail, and the customer when an admin is looking."""

    status_history: list[PurchaseStatusHistoryOut] = Field(default_factory=list)
    customer: UserSummary | None = None


class PurchaseAdminOut(PurchaseOut):
    """Admin list row - includes who bought it."""

    customer: UserSummary
