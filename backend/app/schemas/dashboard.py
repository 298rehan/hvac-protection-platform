"""Read-only dashboard schemas. Every number here comes from a DB query."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.purchase import PurchaseAdminOut, PurchaseOut
from app.schemas.user import UserSummary


class AdminStats(BaseModel):
    total_customers: int
    total_plans: int
    active_plans_sold: int
    pending_purchases: int
    cancelled_purchases: int
    total_revenue: Decimal


class PlanSalesRow(BaseModel):
    plan_id: int
    plan_name: str
    total_purchases: int
    active_purchases: int
    pending_purchases: int
    revenue: Decimal


class AdminDashboardOut(BaseModel):
    stats: AdminStats
    recent_purchases: list[PurchaseAdminOut] = Field(default_factory=list)
    recent_customers: list[UserSummary] = Field(default_factory=list)
    plan_sales: list[PlanSalesRow] = Field(default_factory=list)


class CustomerDashboardOut(BaseModel):
    """Powers the customer dashboard in a single request."""

    customer_name: str
    email: str
    state_code: str | None
    state_name: str | None
    member_since: datetime
    active_plan: PurchaseOut | None = None
    pending_plan: PurchaseOut | None = None
    recent_purchases: list[PurchaseOut] = Field(default_factory=list)
    total_purchases: int = 0
