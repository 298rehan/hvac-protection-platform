"""Business logic for the demo checkout and the purchase lifecycle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ALLOWED_STATUS_TRANSITIONS,
    BillingCycle,
    Plan,
    Purchase,
    PurchaseStatus,
    PurchaseStatusHistory,
    User,
)
from app.schemas.purchase import PurchaseCreate
from app.services import notifications, plan_service


def order_number(purchase: Purchase) -> str:
    return str(purchase.id)


def purchase_payload(purchase: Purchase) -> dict:
    """Purchase columns as a plain dict.

    Used where the response also needs the related customer or the status
    history attached, which `PurchaseOut.model_validate` alone cannot express.
    """
    return {
        "id": purchase.id,
        "user_id": purchase.user_id,
        "plan_id": purchase.plan_id,
        "status": purchase.status,
        "billing_cycle": purchase.billing_cycle,
        "state_code": purchase.state_code,
        "price": purchase.price,
        "created_at": purchase.created_at,
        "activated_at": purchase.activated_at,
        "cancelled_at": purchase.cancelled_at,
        "expires_at": purchase.expires_at,
        "plan": purchase.plan,
    }


def _coverage_end(start: datetime, cycle: BillingCycle) -> datetime:
    """Simple term length - 365 days for annual, 30 days for monthly."""
    return start + (timedelta(days=365) if cycle is BillingCycle.ANNUAL else timedelta(days=30))


def create_purchase(
    db: Session,
    *,
    customer: User,
    payload: PurchaseCreate,
    background: BackgroundTasks,
) -> Purchase:
    """Create a PENDING purchase after checking every enrollment rule."""
    plan = db.get(Plan, payload.plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan {payload.plan_id} was not found.",
        )

    monthly_price, annual_price = plan_service.assert_purchasable(plan, customer.state)

    if payload.billing_cycle is BillingCycle.ANNUAL:
        if annual_price is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The {plan.name} plan is not offered on annual billing in your region.",
            )
        price = annual_price
    else:
        price = monthly_price

    # One live plan at a time keeps the "current plan" on the dashboard unambiguous.
    existing = db.execute(
        select(Purchase).where(
            Purchase.user_id == customer.id,
            Purchase.status.in_([PurchaseStatus.PENDING, PurchaseStatus.ACTIVE]),
        )
    ).scalars().first()
    if existing is not None:
        state_word = "pending" if existing.status is PurchaseStatus.PENDING else "active"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"You already have a {state_word} plan ({existing.plan.name}). "
                "Cancel it before enrolling in a different plan."
            ),
        )

    purchase = Purchase(
        user_id=customer.id,
        plan_id=plan.id,
        status=PurchaseStatus.PENDING,
        billing_cycle=payload.billing_cycle,
        state_code=customer.state.upper(),
        price=price,
    )
    purchase.status_history.append(
        PurchaseStatusHistory(
            from_status=None,
            to_status=PurchaseStatus.PENDING,
            changed_by_user_id=customer.id,
            note="Enrollment submitted through the demo checkout.",
        )
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    # Emails go out after the response so a slow mail server never blocks checkout.
    background.add_task(
        notifications.send_purchase_submitted_email,
        email=customer.email,
        first_name=customer.first_name,
        order_number=order_number(purchase),
        plan_name=plan.name,
        price=purchase.price,
        billing_cycle=purchase.billing_cycle,
        state_code=purchase.state_code,
        submitted_at=purchase.created_at,
    )
    background.add_task(
        notifications.send_admin_new_purchase_email,
        order_number=order_number(purchase),
        customer_name=customer.full_name,
        customer_email=customer.email,
        plan_name=plan.name,
        price=purchase.price,
        billing_cycle=purchase.billing_cycle,
        state_code=purchase.state_code,
        submitted_at=purchase.created_at,
    )
    return purchase


def change_status(
    db: Session,
    *,
    purchase: Purchase,
    new_status: PurchaseStatus,
    actor: User,
    note: str | None,
    background: BackgroundTasks,
) -> Purchase:
    """Apply an admin status change, guarding against invalid transitions."""
    current = purchase.status
    if new_status is current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This purchase is already {current.value}.",
        )

    allowed = ALLOWED_STATUS_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        allowed_text = ", ".join(sorted(s.value for s in allowed)) or "no further changes"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot change a {current.value} purchase to {new_status.value}. "
                f"Allowed from {current.value}: {allowed_text}."
            ),
        )

    now = datetime.now(timezone.utc)
    purchase.status = new_status
    if new_status is PurchaseStatus.ACTIVE:
        purchase.activated_at = now
        purchase.expires_at = _coverage_end(now, purchase.billing_cycle)
    elif new_status is PurchaseStatus.CANCELLED:
        purchase.cancelled_at = now

    purchase.status_history.append(
        PurchaseStatusHistory(
            from_status=current,
            to_status=new_status,
            changed_by_user_id=actor.id,
            note=note,
        )
    )
    db.commit()
    db.refresh(purchase)

    if new_status is PurchaseStatus.ACTIVE:
        background.add_task(
            notifications.send_purchase_active_email,
            email=purchase.user.email,
            first_name=purchase.user.first_name,
            order_number=order_number(purchase),
            plan_name=purchase.plan.name,
            price=purchase.price,
            billing_cycle=purchase.billing_cycle,
            state_code=purchase.state_code,
            activated_at=purchase.activated_at,
            expires_at=purchase.expires_at,
        )
    return purchase


def get_purchase_or_404(db: Session, purchase_id: int) -> Purchase:
    purchase = db.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase {purchase_id} was not found.",
        )
    return purchase
