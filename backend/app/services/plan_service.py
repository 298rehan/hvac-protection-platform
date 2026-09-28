"""Business logic for plans and their regional pricing."""

from __future__ import annotations

import re
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.regions import state_name
from app.models import Plan, PlanRegion, Purchase, PurchaseStatus
from app.schemas.plan import PlanCreate, PlanPublicOut, PlanRegionIn, PlanUpdate


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "plan"


def _unique_slug(db: Session, name: str, *, exclude_plan_id: int | None = None) -> str:
    """Append -2, -3 ... until the slug is free."""
    base = slugify(name)
    candidate = base
    counter = 2
    while True:
        stmt = select(Plan.id).where(Plan.slug == candidate)
        if exclude_plan_id is not None:
            stmt = stmt.where(Plan.id != exclude_plan_id)
        if db.execute(stmt).first() is None:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def _assert_name_available(db: Session, name: str, *, exclude_plan_id: int | None = None) -> None:
    stmt = select(Plan.id).where(func.lower(Plan.name) == name.strip().lower())
    if exclude_plan_id is not None:
        stmt = stmt.where(Plan.id != exclude_plan_id)
    if db.execute(stmt).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A plan named '{name}' already exists.",
        )


def _replace_regions(db: Session, plan: Plan, regions: list[PlanRegionIn]) -> None:
    """Swap a plan's regional pricing for the supplied list."""
    for existing in list(plan.regions):
        db.delete(existing)
    plan.regions.clear()
    db.flush()
    for region in regions:
        plan.regions.append(
            PlanRegion(
                state_code=region.state_code,
                monthly_price=region.monthly_price,
                annual_price=region.annual_price,
                is_available=region.is_available,
            )
        )


# --- Admin CRUD ------------------------------------------------------------


def create_plan(db: Session, payload: PlanCreate) -> Plan:
    _assert_name_available(db, payload.name)
    plan = Plan(
        name=payload.name.strip(),
        slug=_unique_slug(db, payload.name),
        description=payload.description.strip(),
        features=payload.features,
        base_monthly_price=payload.base_monthly_price,
        base_annual_price=payload.base_annual_price,
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    _replace_regions(db, plan, payload.regions)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def get_plan_or_404(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Plan {plan_id} was not found."
        )
    return plan


def update_plan(db: Session, plan: Plan, payload: PlanUpdate) -> Plan:
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"]:
        new_name = data["name"].strip()
        if new_name.lower() != plan.name.lower():
            _assert_name_available(db, new_name, exclude_plan_id=plan.id)
            plan.slug = _unique_slug(db, new_name, exclude_plan_id=plan.id)
        plan.name = new_name

    for field in ("description", "features", "base_monthly_price", "base_annual_price",
                  "is_active", "display_order"):
        if field in data and data[field] is not None:
            setattr(plan, field, data[field])

    if "regions" in data and payload.regions is not None:
        _replace_regions(db, plan, payload.regions)

    db.commit()
    db.refresh(plan)
    return plan


def delete_plan(db: Session, plan: Plan) -> None:
    """Only plans nobody has ever bought can be deleted - history stays intact."""
    purchase_count = db.scalar(
        select(func.count()).select_from(Purchase).where(Purchase.plan_id == plan.id)
    )
    if purchase_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This plan has {purchase_count} purchase record(s) and cannot be deleted. "
                "Deactivate it instead so it stops being offered to new customers."
            ),
        )
    db.delete(plan)
    db.commit()


def list_plans_admin(db: Session, *, include_inactive: bool = True) -> list[Plan]:
    stmt = select(Plan).order_by(Plan.display_order, Plan.id)
    if not include_inactive:
        stmt = stmt.where(Plan.is_active.is_(True))
    return list(db.execute(stmt).unique().scalars().all())


# --- Customer-facing views -------------------------------------------------


def resolve_price(plan: Plan, state_code: str | None) -> tuple[Decimal, Decimal | None, bool]:
    """Return (monthly, annual, available_in_region) for a plan in one state."""
    region = plan.region_for(state_code)
    if region is None:
        return plan.base_monthly_price, plan.base_annual_price, False
    return region.monthly_price, region.annual_price, region.is_available


def to_public(plan: Plan, state_code: str) -> PlanPublicOut:
    monthly, annual, available = resolve_price(plan, state_code)
    return PlanPublicOut(
        id=plan.id,
        name=plan.name,
        slug=plan.slug,
        description=plan.description,
        features=plan.features or [],
        display_order=plan.display_order,
        state_code=state_code.upper(),
        state_name=state_name(state_code),
        monthly_price=monthly,
        annual_price=annual,
        available_in_region=available and plan.is_active,
    )


def list_public_plans(db: Session, state_code: str) -> list[PlanPublicOut]:
    """Active plans that are actually sold in the given state.

    A newly created active plan with a region row for this state shows up here
    immediately - the customer frontend never needs a code change.
    """
    code = state_code.upper()
    stmt = (
        select(Plan)
        .join(PlanRegion, PlanRegion.plan_id == Plan.id)
        .where(
            Plan.is_active.is_(True),
            PlanRegion.state_code == code,
            PlanRegion.is_available.is_(True),
        )
        .order_by(Plan.display_order, Plan.id)
    )
    plans = db.execute(stmt).unique().scalars().all()
    return [to_public(plan, code) for plan in plans]


def assert_purchasable(plan: Plan, state_code: str | None) -> tuple[Decimal, Decimal | None]:
    """Enforce the two checkout rules: plan must be active and sold in the state."""
    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {plan.name} plan is not currently available for new enrollments.",
        )
    if not state_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add your service state to your profile before enrolling in a plan.",
        )

    region = plan.region_for(state_code)
    if region is None or not region.is_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"The {plan.name} plan is not offered in {state_name(state_code)}. "
                "Please choose a plan available in your region."
            ),
        )
    return region.monthly_price, region.annual_price
