"""Aggregate queries behind the two dashboards. Nothing here is hardcoded."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.regions import state_name
from app.models import Plan, Purchase, PurchaseStatus, User, UserRole
from app.services.purchase_service import purchase_payload
from app.schemas.dashboard import (
    AdminDashboardOut,
    AdminStats,
    CustomerDashboardOut,
    PlanSalesRow,
)


def _scalar(db: Session, stmt) -> int:
    return int(db.scalar(stmt) or 0)


def build_admin_stats(db: Session) -> AdminStats:
    total_customers = _scalar(
        db, select(func.count()).select_from(User).where(User.role == UserRole.CUSTOMER)
    )
    total_plans = _scalar(db, select(func.count()).select_from(Plan))
    active_sold = _scalar(
        db, select(func.count()).select_from(Purchase).where(Purchase.status == PurchaseStatus.ACTIVE)
    )
    pending = _scalar(
        db,
        select(func.count()).select_from(Purchase).where(Purchase.status == PurchaseStatus.PENDING),
    )
    cancelled = _scalar(
        db,
        select(func.count()).select_from(Purchase).where(Purchase.status == PurchaseStatus.CANCELLED),
    )

    # Revenue counts only purchases that actually converted (ACTIVE or EXPIRED),
    # summed from the price stored on each purchase record.
    revenue = db.scalar(
        select(func.coalesce(func.sum(Purchase.price), 0)).where(
            Purchase.status.in_([PurchaseStatus.ACTIVE, PurchaseStatus.EXPIRED])
        )
    )

    return AdminStats(
        total_customers=total_customers,
        total_plans=total_plans,
        active_plans_sold=active_sold,
        pending_purchases=pending,
        cancelled_purchases=cancelled,
        total_revenue=Decimal(revenue or 0),
    )


def build_plan_sales(db: Session) -> list[PlanSalesRow]:
    """Per-plan sales summary: one grouped query, no Python-side counting."""
    converted = Purchase.status.in_([PurchaseStatus.ACTIVE, PurchaseStatus.EXPIRED])

    active_count = func.count(case((Purchase.status == PurchaseStatus.ACTIVE, Purchase.id)))
    pending_count = func.count(case((Purchase.status == PurchaseStatus.PENDING, Purchase.id)))
    revenue = func.coalesce(func.sum(case((converted, Purchase.price), else_=0)), 0)

    stmt = (
        select(Plan.id, Plan.name, func.count(Purchase.id), active_count, pending_count, revenue)
        .select_from(Plan)
        .outerjoin(Purchase, Purchase.plan_id == Plan.id)
        .group_by(Plan.id, Plan.name, Plan.display_order)
        .order_by(Plan.display_order, Plan.id)
    )

    return [
        PlanSalesRow(
            plan_id=row[0],
            plan_name=row[1],
            total_purchases=int(row[2] or 0),
            active_purchases=int(row[3] or 0),
            pending_purchases=int(row[4] or 0),
            revenue=Decimal(row[5] or 0),
        )
        for row in db.execute(stmt).all()
    ]


def build_admin_dashboard(db: Session) -> AdminDashboardOut:
    recent_purchases = list(
        db.execute(
            select(Purchase)
            .options(selectinload(Purchase.user))
            .order_by(Purchase.created_at.desc(), Purchase.id.desc())
            .limit(8)
        )
        .unique()
        .scalars()
        .all()
    )
    recent_customers = list(
        db.execute(
            select(User)
            .where(User.role == UserRole.CUSTOMER)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(6)
        )
        .scalars()
        .all()
    )

    return AdminDashboardOut(
        stats=build_admin_stats(db),
        recent_purchases=[
            {**purchase_payload(p), "customer": p.user} for p in recent_purchases
        ],
        recent_customers=recent_customers,
        plan_sales=build_plan_sales(db),
    )


def build_customer_dashboard(db: Session, customer: User) -> CustomerDashboardOut:
    purchases = list(
        db.execute(
            select(Purchase)
            .where(Purchase.user_id == customer.id)
            .order_by(Purchase.created_at.desc(), Purchase.id.desc())
        )
        .unique()
        .scalars()
        .all()
    )

    active = next((p for p in purchases if p.status is PurchaseStatus.ACTIVE), None)
    pending = next((p for p in purchases if p.status is PurchaseStatus.PENDING), None)

    return CustomerDashboardOut(
        customer_name=customer.full_name,
        email=customer.email,
        state_code=customer.state,
        state_name=state_name(customer.state) if customer.state else None,
        member_since=customer.created_at,
        active_plan=active,
        pending_plan=pending,
        recent_purchases=purchases[:5],
        total_purchases=len(purchases),
    )
