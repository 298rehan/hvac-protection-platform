"""Service orders: availability, checkout, status changes and technician booking.

* Checkout re-prices everything on the server and saves the order and its lines
  in one transaction. An idempotency key (unique per customer) makes retries
  return the same order instead of creating a duplicate.
* A requested visit window is only accepted if at least one active technician
  serves the address and has no confirmed visit in that window. The admin then
  books the actual appointment, reusing the claim scheduling rules (row lock +
  locking overlap check), so claims and orders can never double-book a technician.
* Payment is "pay on service": nothing is charged online, and an order is only
  marked PAID by an admin once it is completed with a confirmed (non-estimate) total.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, lazyload

from app.core.regions import state_timezone
from app.models import (
    ORDER_TRANSITIONS,
    TERMINAL_ORDER_STATUSES,
    AcUnit,
    Appointment,
    AppointmentStatus,
    CustomPlan,
    CustomPlanKind,
    OrderStatus as O,
    PaymentStatus,
    PreferredWindow,
    ServiceOrder,
    ServiceOrderItem,
    TechnicianProfile,
    User,
    UserRole,
)
from app.schemas.order import CheckoutIn, OrderDetailOut, OrderItemOut, OrderOut, RescheduleIn
from app.schemas.service_request import AppointmentIn, AppointmentOut, TechnicianBrief
from app.schemas.user import UserSummary
from app.services import pricing_service, scheduling_service

BOOKING_DAYS_AHEAD = 60


def _not_found(order_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order {order_id} was not found.")


# --- Availability -----------------------------------------------------------------


AVAILABILITY_MINUTES = 60


def _area_technicians(db: Session, state: str, zip_code: str) -> list[int]:
    rows = db.execute(
        select(User.id, TechnicianProfile)
        .join(TechnicianProfile, TechnicianProfile.user_id == User.id)
        .where(User.role == UserRole.TECHNICIAN, User.is_active.is_(True))
    ).all()
    return [tech_id for tech_id, profile in rows if scheduling_service.area_match(profile, state, zip_code)]


def _window_free(db: Session, tech_ids: list[int], day: date, window: PreferredWindow, tz_name: str,
                 exclude_order_id: int | None = None) -> bool:
    window_dict = {"date": day.isoformat(), "window": window.value}
    return any(
        scheduling_service.free_slot_in_window(
            db, tech_id, db.get(TechnicianProfile, tech_id), window_dict, tz_name,
            AVAILABILITY_MINUTES, exclude_order_id=exclude_order_id,
        )
        for tech_id in tech_ids
    )


def availability(db: Session, *, state: str, zip_code: str, days: int = 14) -> list[dict]:
    tz_name = state_timezone(state)
    tech_ids = _area_technicians(db, state, zip_code)
    today = datetime.now(ZoneInfo(tz_name)).date()
    slots = []
    for offset in range(1, days + 1):
        day = today + timedelta(days=offset)
        for window in PreferredWindow:
            free = bool(tech_ids) and _window_free(db, tech_ids, day, window, tz_name)
            slots.append({"date": day, "window": window, "available": free})
    return slots


def assert_slot_available(db: Session, *, state: str, zip_code: str, day: date, window: PreferredWindow,
                          exclude_order_id: int | None = None) -> None:
    tz_name = state_timezone(state)
    today = datetime.now(ZoneInfo(tz_name)).date()
    if not today < day <= today + timedelta(days=BOOKING_DAYS_AHEAD):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Choose a visit date between tomorrow and {BOOKING_DAYS_AHEAD} days from now.",
        )
    tech_ids = _area_technicians(db, state, zip_code)
    if not tech_ids:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sorry, we don't have technicians serving this address yet.",
        )
    if not _window_free(db, tech_ids, day, window, tz_name, exclude_order_id=exclude_order_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That time is no longer available. Please choose another date or time window.",
        )


# --- Checkout ---------------------------------------------------------------------


def _existing_order(db: Session, customer_id: int, key: str) -> ServiceOrder | None:
    return db.execute(
        select(ServiceOrder).where(ServiceOrder.customer_id == customer_id, ServiceOrder.idempotency_key == key)
    ).scalars().first()


def _resolve_address(db: Session, customer: User, payload: CheckoutIn) -> tuple[AcUnit | None, dict]:
    if payload.ac_unit_id is not None:
        unit = db.get(AcUnit, payload.ac_unit_id)
        if unit is None or unit.customer_id != customer.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That AC unit was not found.")
        return unit, {"address": unit.address, "city": unit.city, "state": unit.state, "zip_code": unit.zip_code}
    return None, {
        "address": payload.address.strip(),
        "city": payload.city.strip(),
        "state": payload.state,
        "zip_code": payload.zip_code.strip(),
    }


def checkout(db: Session, *, customer: User, payload: CheckoutIn) -> tuple[ServiceOrder, bool]:
    """Create an order. Returns (order, created) - created is False for a retried checkout."""
    existing = _existing_order(db, customer.id, payload.idempotency_key)
    if existing is not None:
        return existing, False

    unit, address = _resolve_address(db, customer, payload)
    if payload.custom_plan_id is not None:
        plan = db.get(CustomPlan, payload.custom_plan_id)
        if plan is None or plan.customer_id != customer.id or plan.kind is not CustomPlanKind.PLAN:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That custom plan was not found.")

    priced = pricing_service.price_items(
        db, payload.items, discount_code=payload.discount_code, state=address["state"], lock_discount=True
    )
    if not priced.ok:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=" ".join(p.message for p in priced.quote.problems),
        )
    assert_slot_available(
        db, state=address["state"], zip_code=address["zip_code"],
        day=payload.requested_date, window=payload.requested_window,
    )

    quote = priced.quote
    order = ServiceOrder(
        customer_id=customer.id,
        idempotency_key=payload.idempotency_key,
        custom_plan_id=payload.custom_plan_id,
        ac_unit_id=unit.id if unit else None,
        status=O.PENDING_CONFIRMATION,
        payment_method=payload.payment_method,
        payment_status=PaymentStatus.PENDING,
        requested_date=payload.requested_date,
        requested_window=payload.requested_window,
        customer_notes=(payload.notes or "").strip() or None,
        currency=quote.currency,
        subtotal=quote.subtotal,
        discount_code=quote.discount_code,
        discount_amount=quote.discount_amount,
        tax_amount=quote.tax_amount,
        fee_amount=quote.fee_amount,
        total=quote.total,
        total_is_estimate=quote.total_is_estimate,
        **address,
    )
    for line, out in zip(priced.lines, quote.lines):
        order.items.append(
            ServiceOrderItem(
                service_id=line.service.id,
                service_name=line.service.name,
                pricing_type=line.service.pricing_type,
                unit_price=line.unit_price,
                quantity=line.quantity,
                frequency=line.frequency,
                addons=[{"name": a.name, "price": str(a.price)} for a in line.addons],
                line_total=line.line_total,
                duration_minutes=out.duration_minutes,
                is_estimate=out.is_estimate,
            )
        )
    if priced.discount is not None:
        priced.discount.times_used += 1
    if payload.from_cart:
        cart = get_cart(db, customer, create=False)
        if cart is not None:
            cart.items.clear()

    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        # Two identical submissions raced; the other one won - return it.
        db.rollback()
        existing = _existing_order(db, customer.id, payload.idempotency_key)
        if existing is None:
            raise
        return existing, False
    db.refresh(order)
    return order, True


def get_cart(db: Session, customer: User, *, create: bool = True) -> CustomPlan | None:
    cart = db.execute(
        select(CustomPlan).where(CustomPlan.customer_id == customer.id, CustomPlan.kind == CustomPlanKind.CART)
    ).scalars().first()
    if cart is None and create:
        cart = CustomPlan(customer_id=customer.id, kind=CustomPlanKind.CART, name="Cart")
        db.add(cart)
        db.flush()
    return cart


# --- Access and transitions ---------------------------------------------------------


def can_view(order: ServiceOrder, user: User) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if user.role is UserRole.CUSTOMER:
        return order.customer_id == user.id
    return order.assigned_technician_id == user.id


def get_for_viewer(db: Session, order_id: int, user: User, *, lock: bool = False) -> ServiceOrder:
    stmt = select(ServiceOrder).where(ServiceOrder.id == order_id)
    if lock:
        stmt = stmt.options(lazyload(ServiceOrder.items), lazyload(ServiceOrder.appointments)).with_for_update()
    order = db.execute(stmt).unique().scalars().first()
    if order is None or not can_view(order, user):
        raise _not_found(order_id)
    return order


def _transition(order: ServiceOrder, new_status: O, actor: User) -> None:
    roles = ORDER_TRANSITIONS.get((order.status, new_status))
    if roles is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An order that is {order.status.value.replace('_', ' ').lower()} cannot be moved to "
                   f"{new_status.value.replace('_', ' ').lower()}.",
        )
    if actor.role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to make this change.")
    if actor.role is UserRole.TECHNICIAN and order.assigned_technician_id != actor.id:
        raise _not_found(order.id)
    order.status = new_status
    now = datetime.now(timezone.utc)
    if new_status is O.CONFIRMED:
        order.confirmed_at = now
    elif new_status is O.COMPLETED:
        order.completed_at = now
    elif new_status is O.CANCELLED:
        order.cancelled_at = now


def _commit(db: Session, order: ServiceOrder) -> ServiceOrder:
    db.commit()
    db.refresh(order)
    return order


def confirm(db: Session, *, order: ServiceOrder, admin: User) -> ServiceOrder:
    _transition(order, O.CONFIRMED, admin)
    return _commit(db, order)


def cancel(db: Session, *, order: ServiceOrder, actor: User, reason: str | None) -> ServiceOrder:
    _transition(order, O.CANCELLED, actor)
    appointment = db.execute(
        select(Appointment).where(Appointment.service_order_id == order.id,
                                  Appointment.status == AppointmentStatus.CONFIRMED)
    ).scalars().first()
    if appointment is not None:
        appointment.status = AppointmentStatus.CANCELLED
        appointment.cancelled_at = datetime.now(timezone.utc)
    if order.payment_status is PaymentStatus.PENDING:
        order.payment_status = PaymentStatus.VOID
    order.status_reason = reason
    return _commit(db, order)


def reschedule(db: Session, *, order: ServiceOrder, customer: User, payload: RescheduleIn) -> ServiceOrder:
    if order.customer_id != customer.id:
        raise _not_found(order.id)
    if order.status not in (O.PENDING_CONFIRMATION, O.CONFIRMED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This visit is already booked with a technician. Please contact us to change it.",
        )
    assert_slot_available(db, state=order.state, zip_code=order.zip_code, day=payload.requested_date,
                          window=payload.requested_window, exclude_order_id=order.id)
    order.requested_date = payload.requested_date
    order.requested_window = payload.requested_window
    return _commit(db, order)


def _recalculate_totals(order: ServiceOrder) -> None:
    subtotal = pricing_service.money(sum((item.line_total for item in order.items), Decimal("0")))
    discount = min(order.discount_amount, subtotal)
    taxable = subtotal - discount
    rate = pricing_service.settings.service_tax_rate
    order.subtotal = subtotal
    order.discount_amount = discount
    order.tax_amount = pricing_service.money(taxable * rate) if rate > 0 else Decimal("0.00")
    order.total = pricing_service.money(taxable + order.tax_amount + order.fee_amount)
    order.total_is_estimate = any(item.is_estimate for item in order.items)


def set_final_prices(db: Session, *, order: ServiceOrder, admin: User, prices) -> ServiceOrder:
    """Record confirmed prices for 'starting at' lines after inspection."""
    if order.status is O.CANCELLED or order.payment_status is not PaymentStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prices can no longer be changed for this order.")
    items = {item.id: item for item in order.items}
    for entry in prices:
        item = items.get(entry.item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Item {entry.item_id} is not on this order.")
        if not item.is_estimate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail=f"{item.service_name} already has a confirmed price.")
        addon_total = sum((Decimal(a["price"]) for a in item.addons), Decimal("0"))
        item.unit_price = pricing_service.money(entry.unit_price + addon_total)
        item.line_total = pricing_service.money(item.unit_price * item.quantity)
        item.is_estimate = False
    _recalculate_totals(order)
    return _commit(db, order)


def mark_paid(db: Session, *, order: ServiceOrder, admin: User) -> ServiceOrder:
    if order.status is not O.COMPLETED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a completed order can be marked as paid.")
    if order.total_is_estimate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Record the final prices for all estimated services first.")
    if order.payment_status is not PaymentStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This order's payment is already recorded.")
    order.payment_status = PaymentStatus.PAID
    order.paid_at = datetime.now(timezone.utc)
    return _commit(db, order)


def start_work(db: Session, *, order: ServiceOrder, technician: User) -> ServiceOrder:
    _transition(order, O.IN_PROGRESS, technician)
    return _commit(db, order)


def complete(db: Session, *, order: ServiceOrder, actor: User) -> ServiceOrder:
    _transition(order, O.COMPLETED, actor)
    return _commit(db, order)


# --- Technician booking (admin) -----------------------------------------------------


def eligible_technicians(db: Session, order: ServiceOrder) -> list[dict]:
    tz_name = state_timezone(order.state)
    window = {"date": order.requested_date.isoformat(), "window": order.requested_window.value}
    results = []
    for tech_id in _area_technicians(db, order.state, order.zip_code):
        tech = db.get(User, tech_id)
        profile = db.get(TechnicianProfile, tech_id)
        busy = not scheduling_service.free_slot_in_window(
            db, tech_id, profile, window, tz_name, AVAILABILITY_MINUTES, exclude_order_id=order.id,
        )
        results.append({
            "id": tech.id,
            "first_name": tech.first_name,
            "last_name": tech.last_name,
            "phone": tech.phone,
            "service_states": profile.service_states or [],
            "service_zip_prefixes": profile.service_zip_prefixes or [],
            "free_in_requested_window": not busy,
            "open_jobs": _open_jobs(db, tech_id),
        })
    results.sort(key=lambda t: (not t["free_in_requested_window"], t["open_jobs"], t["first_name"]))
    return results


def _open_jobs(db: Session, tech_id: int) -> int:
    orders = db.scalar(
        select(func.count()).select_from(ServiceOrder).where(
            ServiceOrder.assigned_technician_id == tech_id, ServiceOrder.status.not_in(TERMINAL_ORDER_STATUSES)
        )
    )
    return orders + scheduling_service._open_jobs(db, tech_id)


def schedule(db: Session, *, order: ServiceOrder, admin: User, payload: AppointmentIn) -> ServiceOrder:
    """Assign a technician and book the visit. `order` must be loaded FOR UPDATE."""
    if order.status not in (O.CONFIRMED, O.SCHEDULED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Confirm the order before booking a technician.")
    from app.services import service_request_service as svc

    tech = svc.get_active_technician(db, payload.technician_id)
    if scheduling_service.area_match(db.get(TechnicianProfile, tech.id), order.state, order.zip_code) is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{tech.first_name} {tech.last_name} does not serve {order.city}, {order.state} {order.zip_code}.",
        )
    tz_name = state_timezone(order.state)
    start, end = scheduling_service._visit_bounds(payload, tz_name)
    scheduling_service.check_working_hours(db.get(TechnicianProfile, tech.id), tech, start, end, tz_name)

    db.execute(select(User.id).where(User.id == tech.id).with_for_update())
    clashes = scheduling_service.confirmed_overlaps(db, tech.id, start, end, exclude_order_id=order.id, for_booking=True)
    if clashes:
        clash = clashes[0]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(f"{tech.first_name} already has a visit from {scheduling_service.format_local(clash.start_at, tz_name)} "
                    f"to {scheduling_service.format_local(clash.end_at, tz_name)}."),
        )

    previous = db.execute(
        select(Appointment).where(Appointment.service_order_id == order.id,
                                  Appointment.status == AppointmentStatus.CONFIRMED)
    ).scalars().first()
    if previous is not None:
        previous.status = AppointmentStatus.CANCELLED
        previous.cancelled_at = datetime.now(timezone.utc)

    db.add(Appointment(
        service_order_id=order.id, technician_id=tech.id, start_at=start, end_at=end,
        timezone=tz_name, status=AppointmentStatus.CONFIRMED, created_by_user_id=admin.id,
    ))
    order.assigned_technician_id = tech.id
    if order.status is O.CONFIRMED:
        _transition(order, O.SCHEDULED, admin)
    return _commit(db, order)


# --- Queries and serialisation ---------------------------------------------------------


def list_orders(db: Session, *, customer_id: int | None = None, technician_id: int | None = None,
                status_filter: O | None = None, payment_status: PaymentStatus | None = None,
                search: str | None = None, open_only: bool = False, limit: int = 50, offset: int = 0) -> list[ServiceOrder]:
    stmt = select(ServiceOrder).join(User, User.id == ServiceOrder.customer_id)
    if customer_id is not None:
        stmt = stmt.where(ServiceOrder.customer_id == customer_id)
    if technician_id is not None:
        stmt = stmt.where(ServiceOrder.assigned_technician_id == technician_id)
    if status_filter is not None:
        stmt = stmt.where(ServiceOrder.status == status_filter)
    if payment_status is not None:
        stmt = stmt.where(ServiceOrder.payment_status == payment_status)
    if open_only:
        stmt = stmt.where(ServiceOrder.status.not_in(TERMINAL_ORDER_STATUSES))
    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(needle),
                              func.lower(User.first_name + " " + User.last_name).like(needle)))
    stmt = stmt.order_by(ServiceOrder.created_at.desc(), ServiceOrder.id.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).unique().scalars())


def _base(order: ServiceOrder, viewer: User) -> dict:
    appointment = order.active_appointment
    tech = order.assigned_technician
    return {
        "id": order.id,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "currency": order.currency,
        "total": order.total,
        "total_is_estimate": order.total_is_estimate,
        "requested_date": order.requested_date,
        "requested_window": order.requested_window,
        "city": order.city,
        "state": order.state,
        "created_at": order.created_at,
        "item_count": len(order.items),
        "service_names": [item.service_name for item in order.items],
        "timezone": state_timezone(order.state),
        "appointment": AppointmentOut.model_validate(appointment) if appointment else None,
        "technician": TechnicianBrief.model_validate(tech) if tech else None,
        "customer": UserSummary.model_validate(order.customer) if viewer.role is not UserRole.CUSTOMER else None,
    }


def row(order: ServiceOrder, viewer: User) -> OrderOut:
    return OrderOut(**_base(order, viewer))


def detail(order: ServiceOrder, viewer: User) -> OrderDetailOut:
    return OrderDetailOut(
        **_base(order, viewer),
        address=order.address,
        zip_code=order.zip_code,
        ac_unit_id=order.ac_unit_id,
        custom_plan_id=order.custom_plan_id,
        customer_notes=order.customer_notes,
        subtotal=order.subtotal,
        discount_code=order.discount_code,
        discount_amount=order.discount_amount,
        tax_amount=order.tax_amount,
        fee_amount=order.fee_amount,
        status_reason=order.status_reason,
        confirmed_at=order.confirmed_at,
        completed_at=order.completed_at,
        cancelled_at=order.cancelled_at,
        paid_at=order.paid_at,
        total_duration_minutes=sum(item.duration_minutes for item in order.items),
        items=[OrderItemOut.model_validate(item) for item in order.items],
    )
