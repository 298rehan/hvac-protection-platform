"""Saved custom plans and the cart. Both store only service choices; prices are
recalculated from the catalog every time they are read."""

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.core.deps import CustomerUser, DbSession
from app.models import AcUnit, CustomPlan, CustomPlanItem, CustomPlanKind, User
from app.schemas.order import CustomPlanOut, PlanItemOut, PlanItemsIn
from app.services import order_service, pricing_service

router = APIRouter(tags=["Custom Plans & Cart"])

MAX_SAVED_PLANS = 20


def _out(db, plan: CustomPlan, customer: User) -> CustomPlanOut:
    items = [
        PlanItemOut(service_id=i.service_id, quantity=i.quantity, frequency=i.frequency, addon_ids=i.addon_ids or [])
        for i in plan.items
    ]
    state = None
    if plan.ac_unit_id:
        unit = db.get(AcUnit, plan.ac_unit_id)
        state = unit.state if unit else None
    quote = (
        pricing_service.price_items(db, items, state=state or customer.state).quote
        if items else None
    )
    return CustomPlanOut(
        id=plan.id, kind=plan.kind, name=plan.name, ac_unit_id=plan.ac_unit_id,
        created_at=plan.created_at, updated_at=plan.updated_at, items=items, quote=quote,
    )


def _apply(db, plan: CustomPlan, customer: User, payload: PlanItemsIn) -> None:
    if payload.name is not None:
        plan.name = payload.name.strip()
    if "ac_unit_id" in payload.model_fields_set:
        if payload.ac_unit_id is not None:
            unit = db.get(AcUnit, payload.ac_unit_id)
            if unit is None or unit.customer_id != customer.id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That AC unit was not found.")
        plan.ac_unit_id = payload.ac_unit_id
    plan.items.clear()
    db.flush()
    for item in payload.items:
        plan.items.append(CustomPlanItem(
            service_id=item.service_id, quantity=item.quantity,
            frequency=item.frequency, addon_ids=item.addon_ids,
        ))


def _get_plan(db, plan_id: int, customer: User) -> CustomPlan:
    plan = db.get(CustomPlan, plan_id)
    if plan is None or plan.customer_id != customer.id or plan.kind is not CustomPlanKind.PLAN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Custom plan {plan_id} was not found.")
    return plan


# --- Saved plans --------------------------------------------------------------------


@router.get("/api/custom-plans", response_model=list[CustomPlanOut], summary="My saved custom plans")
def list_plans(db: DbSession, customer: CustomerUser):
    plans = db.execute(
        select(CustomPlan).where(CustomPlan.customer_id == customer.id, CustomPlan.kind == CustomPlanKind.PLAN)
        .order_by(CustomPlan.updated_at.desc())
    ).scalars()
    return [_out(db, p, customer) for p in plans]


@router.post("/api/custom-plans", response_model=CustomPlanOut, status_code=status.HTTP_201_CREATED,
             summary="Save a new custom plan (draft)")
def create_plan(payload: PlanItemsIn, db: DbSession, customer: CustomerUser):
    count = len(db.execute(select(CustomPlan.id).where(
        CustomPlan.customer_id == customer.id, CustomPlan.kind == CustomPlanKind.PLAN)).all())
    if count >= MAX_SAVED_PLANS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"You can keep up to {MAX_SAVED_PLANS} saved plans. Delete one first.")
    plan = CustomPlan(customer_id=customer.id, kind=CustomPlanKind.PLAN, name="My Custom HVAC Plan")
    db.add(plan)
    _apply(db, plan, customer, payload)
    db.commit()
    db.refresh(plan)
    return _out(db, plan, customer)


@router.get("/api/custom-plans/{plan_id}", response_model=CustomPlanOut, summary="One saved plan, priced today")
def get_plan(plan_id: int, db: DbSession, customer: CustomerUser):
    return _out(db, _get_plan(db, plan_id, customer), customer)


@router.put("/api/custom-plans/{plan_id}", response_model=CustomPlanOut, summary="Update a saved plan")
def update_plan(plan_id: int, payload: PlanItemsIn, db: DbSession, customer: CustomerUser):
    plan = _get_plan(db, plan_id, customer)
    _apply(db, plan, customer, payload)
    db.commit()
    db.refresh(plan)
    return _out(db, plan, customer)


@router.delete("/api/custom-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a saved plan")
def delete_plan(plan_id: int, db: DbSession, customer: CustomerUser):
    db.delete(_get_plan(db, plan_id, customer))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Cart ---------------------------------------------------------------------------


@router.get("/api/cart", response_model=CustomPlanOut, summary="My cart, priced today")
def get_cart(db: DbSession, customer: CustomerUser):
    cart = order_service.get_cart(db, customer)
    db.commit()
    return _out(db, cart, customer)


@router.put("/api/cart", response_model=CustomPlanOut, summary="Replace my cart's items")
def update_cart(payload: PlanItemsIn, db: DbSession, customer: CustomerUser):
    cart = order_service.get_cart(db, customer)
    _apply(db, cart, customer, payload)
    db.commit()
    db.refresh(cart)
    return _out(db, cart, customer)


@router.delete("/api/cart", status_code=status.HTTP_204_NO_CONTENT, summary="Empty my cart")
def clear_cart(db: DbSession, customer: CustomerUser):
    cart = order_service.get_cart(db, customer, create=False)
    if cart is not None:
        cart.items.clear()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
