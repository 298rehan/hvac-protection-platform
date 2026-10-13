"""Business logic for customer AC unit registration."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.models import (
    TERMINAL_SERVICE_REQUEST_STATUSES,
    AcUnit,
    Photo,
    PhotoStatus,
    Purchase,
    PurchaseStatus,
    ServiceRequest,
    User,
    UserRole,
)
from app.schemas.ac_unit import AcUnitCreate, AcUnitOut, AcUnitUpdate
from app.services import photo_service, storage

LIVE_PURCHASE_STATUSES = (PurchaseStatus.PENDING, PurchaseStatus.ACTIVE)


def current_purchase(db: Session, customer_id: int, *, lock: bool = False) -> Purchase | None:
    """The customer's pending or active purchase (there is at most one)."""
    stmt = select(Purchase).where(
        Purchase.user_id == customer_id, Purchase.status.in_(LIVE_PURCHASE_STATUSES)
    )
    if lock:
        stmt = stmt.with_for_update()
    return db.execute(stmt).unique().scalars().first()


def _assert_capacity(db: Session, purchase: Purchase) -> None:
    used = db.scalar(
        select(func.count()).select_from(AcUnit).where(AcUnit.purchase_id == purchase.id)
    )
    limit = purchase.plan.max_ac_units
    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Your {purchase.plan.name} plan covers up to {limit} AC unit(s), and "
                f"{used} {'is' if used == 1 else 'are'} already registered."
            ),
        )


def create_unit(db: Session, *, customer: User, payload: AcUnitCreate) -> AcUnit:
    # Locking the purchase row serialises concurrent registrations, so two
    # simultaneous requests cannot both squeeze under the plan's unit limit.
    purchase = current_purchase(db, customer.id, lock=True)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enroll in a protection plan before registering an AC unit.",
        )
    _assert_capacity(db, purchase)

    unit = AcUnit(customer_id=customer.id, purchase_id=purchase.id, **payload.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


def attach_to_current_plan(db: Session, *, unit: AcUnit, customer: User) -> AcUnit:
    """Move a unit from an old (cancelled/expired) plan onto the current one."""
    purchase = current_purchase(db, customer.id, lock=True)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You do not have a pending or active plan to attach this unit to.",
        )
    if unit.purchase_id == purchase.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This AC unit is already covered by your current plan.",
        )
    _assert_capacity(db, purchase)
    unit.purchase_id = purchase.id
    db.commit()
    db.refresh(unit)
    return unit


def update_unit(db: Session, *, unit: AcUnit, payload: AcUnitUpdate) -> AcUnit:
    for field, value in payload.model_dump(exclude_unset=True).items():
        # Required columns ignore an explicit null; optional ones may be cleared.
        if value is None and field not in {"serial_number", "installation_date", "notes"}:
            continue
        setattr(unit, field, value)
    db.commit()
    db.refresh(unit)
    return unit


def delete_unit(db: Session, *, unit: AcUnit) -> None:
    """Only units with no service history can be removed."""
    if db.scalar(select(exists().where(ServiceRequest.ac_unit_id == unit.id))):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This AC unit has service history and cannot be removed.",
        )
    keys = list(db.execute(select(Photo.s3_key).where(Photo.ac_unit_id == unit.id)).scalars())
    db.delete(unit)
    db.commit()
    # Objects are removed only after the rows are gone, so a failure here can
    # leave an unreferenced object (cleaned by lifecycle) but never a dangling row.
    for key in keys:
        storage.delete_object(key)


def has_service_history(db: Session, unit_id: int) -> bool:
    return bool(db.scalar(select(exists().where(ServiceRequest.ac_unit_id == unit_id))))


def has_open_request(db: Session, unit_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    ServiceRequest.ac_unit_id == unit_id,
                    ServiceRequest.status.not_in(TERMINAL_SERVICE_REQUEST_STATUSES),
                )
            )
        )
    )


def can_view(db: Session, unit: AcUnit, user: User) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if user.role is UserRole.CUSTOMER:
        return unit.customer_id == user.id
    # Technicians see units they have (or had) a job on.
    return bool(
        db.scalar(
            select(
                exists().where(
                    ServiceRequest.ac_unit_id == unit.id,
                    ServiceRequest.assigned_technician_id == user.id,
                )
            )
        )
    )


def get_for_viewer(db: Session, unit_id: int, user: User) -> AcUnit:
    """Load a unit the user may see. 404 (not 403) so ids cannot be probed."""
    unit = db.get(AcUnit, unit_id)
    if unit is None or not can_view(db, unit, user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"AC unit {unit_id} was not found."
        )
    return unit


def get_owned(db: Session, unit_id: int, customer: User) -> AcUnit:
    unit = db.get(AcUnit, unit_id)
    if unit is None or unit.customer_id != customer.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"AC unit {unit_id} was not found."
        )
    return unit


def serialise(db: Session, unit: AcUnit) -> AcUnitOut:
    photos = db.execute(
        select(Photo)
        .where(Photo.ac_unit_id == unit.id, Photo.status == PhotoStatus.UPLOADED)
        .order_by(Photo.created_at)
    ).scalars()
    out = AcUnitOut.model_validate(unit)
    out.plan_name = unit.purchase.plan.name if unit.purchase is not None else None
    out.has_open_request = has_open_request(db, unit.id)
    out.photos = [photo_service.serialise(p) for p in photos]
    return out
