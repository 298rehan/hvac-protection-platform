"""Service orders: checkout, order history, and the admin / technician lifecycle."""

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel

from app.core.deps import AdminUser, CurrentUser, CustomerUser, DbSession, TechnicianUser
from app.models import OrderStatus, PaymentStatus
from app.schemas.order import CheckoutIn, FinalPricesIn, OrderDetailOut, OrderOut, RescheduleIn
from app.schemas.service_request import AppointmentIn, NoteIn
from app.services import order_service as orders

router = APIRouter(prefix="/api/orders", tags=["Service Orders"])


class OrderTechnicianOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    phone: str | None
    service_states: list[str]
    service_zip_prefixes: list[str]
    free_in_requested_window: bool
    open_jobs: int


# --- Customer -------------------------------------------------------------------------


@router.post("", response_model=OrderDetailOut, summary="Check out (server re-prices everything)")
def create_order(payload: CheckoutIn, db: DbSession, customer: CustomerUser, response: Response):
    """Returns 201 for a new order, or 200 with the original order when the same
    checkout (same idempotency_key) is submitted again."""
    order, created = orders.checkout(db, customer=customer, payload=payload)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return orders.detail(order, customer)


@router.get("/me", response_model=list[OrderOut], summary="My order history")
def my_orders(db: DbSession, customer: CustomerUser,
              limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0)):
    return [orders.row(o, customer) for o in orders.list_orders(db, customer_id=customer.id, limit=limit, offset=offset)]


@router.post("/{order_id}/reschedule", response_model=OrderDetailOut, summary="Change my requested visit time")
def reschedule(order_id: int, payload: RescheduleIn, db: DbSession, customer: CustomerUser):
    order = orders.get_for_viewer(db, order_id, customer, lock=True)
    return orders.detail(orders.reschedule(db, order=order, customer=customer, payload=payload), customer)


# --- Technician -----------------------------------------------------------------------


@router.get("/assigned", response_model=list[OrderOut], summary="Orders assigned to me (technician)")
def assigned(db: DbSession, technician: TechnicianUser, include_closed: bool = False):
    return [orders.row(o, technician)
            for o in orders.list_orders(db, technician_id=technician.id, open_only=not include_closed, limit=200)]


@router.post("/{order_id}/start", response_model=OrderDetailOut, summary="Start the visit (technician)")
def start(order_id: int, db: DbSession, technician: TechnicianUser):
    order = orders.get_for_viewer(db, order_id, technician, lock=True)
    return orders.detail(orders.start_work(db, order=order, technician=technician), technician)


# --- Admin ----------------------------------------------------------------------------


@router.get("", response_model=list[OrderOut], summary="All service orders (admin)")
def list_all(
    db: DbSession, admin: AdminUser,
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    payment_status: PaymentStatus | None = None,
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
):
    return [orders.row(o, admin) for o in orders.list_orders(
        db, status_filter=status_filter, payment_status=payment_status, search=search, limit=limit, offset=offset)]


@router.post("/{order_id}/confirm", response_model=OrderDetailOut, summary="Confirm an order (admin)")
def confirm(order_id: int, db: DbSession, admin: AdminUser):
    order = orders.get_for_viewer(db, order_id, admin, lock=True)
    return orders.detail(orders.confirm(db, order=order, admin=admin), admin)


@router.get("/{order_id}/eligible-technicians", response_model=list[OrderTechnicianOut],
            summary="Technicians serving this address (admin)")
def eligible(order_id: int, db: DbSession, admin: AdminUser):
    return orders.eligible_technicians(db, orders.get_for_viewer(db, order_id, admin))


@router.post("/{order_id}/appointment", response_model=OrderDetailOut,
             summary="Assign a technician and book the visit (admin)")
def book(order_id: int, payload: AppointmentIn, db: DbSession, admin: AdminUser):
    order = orders.get_for_viewer(db, order_id, admin, lock=True)
    return orders.detail(orders.schedule(db, order=order, admin=admin, payload=payload), admin)


@router.put("/{order_id}/final-prices", response_model=OrderDetailOut,
            summary="Record confirmed prices for estimated services (admin)")
def final_prices(order_id: int, payload: FinalPricesIn, db: DbSession, admin: AdminUser):
    order = orders.get_for_viewer(db, order_id, admin, lock=True)
    return orders.detail(orders.set_final_prices(db, order=order, admin=admin, prices=payload.prices), admin)


@router.post("/{order_id}/mark-paid", response_model=OrderDetailOut, summary="Record payment received (admin)")
def mark_paid(order_id: int, db: DbSession, admin: AdminUser):
    order = orders.get_for_viewer(db, order_id, admin, lock=True)
    return orders.detail(orders.mark_paid(db, order=order, admin=admin), admin)


# --- Shared ---------------------------------------------------------------------------


@router.get("/{order_id}", response_model=OrderDetailOut, summary="Order detail")
def get_order(order_id: int, db: DbSession, user: CurrentUser):
    """Customers see their own orders, technicians their assigned ones, admins all."""
    return orders.detail(orders.get_for_viewer(db, order_id, user), user)


@router.post("/{order_id}/complete", response_model=OrderDetailOut, summary="Mark the visit completed (technician or admin)")
def complete(order_id: int, db: DbSession, user: CurrentUser):
    order = orders.get_for_viewer(db, order_id, user, lock=True)
    return orders.detail(orders.complete(db, order=order, actor=user), user)


@router.post("/{order_id}/cancel", response_model=OrderDetailOut, summary="Cancel (customer before booking, or admin)")
def cancel(order_id: int, payload: NoteIn, db: DbSession, user: CurrentUser):
    order = orders.get_for_viewer(db, order_id, user, lock=True)
    return orders.detail(orders.cancel(db, order=order, actor=user, reason=payload.note), user)
