"""Purchase (enrollment) endpoints.

Customers see only their own records. Status changes are admin-only.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, CurrentUser, CustomerUser, DbSession
from app.models import Plan, Purchase, PurchaseStatus, User, UserRole
from app.schemas.purchase import (
    PurchaseAdminOut,
    PurchaseCreate,
    PurchaseDetailOut,
    PurchaseOut,
    PurchaseStatusUpdate,
)
from app.services import purchase_service
from app.services.purchase_service import purchase_payload

router = APIRouter(prefix="/api/purchases", tags=["Purchases"])


@router.post(
    "",
    response_model=PurchaseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a plan enrollment (demo checkout)",
)
def create_purchase(
    payload: PurchaseCreate,
    db: DbSession,
    customer: CustomerUser,
    background: BackgroundTasks,
):
    """Creates a PENDING purchase.

    This is a **demo checkout** - no payment gateway is contacted and no card
    details are collected or stored.
    """
    return purchase_service.create_purchase(
        db, customer=customer, payload=payload, background=background
    )


@router.get("/me", response_model=list[PurchaseOut], summary="My purchases")
def list_my_purchases(db: DbSession, customer: CustomerUser):
    return list(
        db.execute(
            select(Purchase)
            .where(Purchase.user_id == customer.id)
            .order_by(Purchase.created_at.desc(), Purchase.id.desc())
        )
        .unique()
        .scalars()
        .all()
    )


@router.get("", response_model=list[PurchaseAdminOut], summary="All purchases (admin)")
def list_purchases(
    db: DbSession,
    _: AdminUser,
    status_filter: PurchaseStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(
        default=None, max_length=120, description="Matches customer name, email or plan name."
    ),
    plan_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Purchase)
        .join(User, User.id == Purchase.user_id)
        .join(Plan, Plan.id == Purchase.plan_id)
        .options(selectinload(Purchase.user))
        .order_by(Purchase.created_at.desc(), Purchase.id.desc())
    )

    if status_filter is not None:
        stmt = stmt.where(Purchase.status == status_filter)
    if plan_id is not None:
        stmt = stmt.where(Purchase.plan_id == plan_id)
    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(needle),
                func.lower(User.first_name + " " + User.last_name).like(needle),
                func.lower(Plan.name).like(needle),
            )
        )

    purchases = db.execute(stmt.limit(limit).offset(offset)).unique().scalars().all()
    return [{**purchase_payload(p), "customer": p.user} for p in purchases]


@router.get("/{purchase_id}", response_model=PurchaseDetailOut, summary="Purchase detail")
def get_purchase(purchase_id: int, db: DbSession, user: CurrentUser):
    """Customers may only read their own purchase; admins may read any."""
    purchase = purchase_service.get_purchase_or_404(db, purchase_id)

    if user.role is not UserRole.ADMIN and purchase.user_id != user.id:
        # 404 rather than 403 so one customer cannot probe for another's order ids.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Purchase {purchase_id} was not found.",
        )

    payload = {**purchase_payload(purchase), "status_history": purchase.status_history}
    if user.role is UserRole.ADMIN:
        payload["customer"] = purchase.user
    return payload


@router.patch(
    "/{purchase_id}/status",
    response_model=PurchaseDetailOut,
    summary="Approve or cancel a purchase (admin)",
)
def update_purchase_status(
    purchase_id: int,
    payload: PurchaseStatusUpdate,
    db: DbSession,
    admin: AdminUser,
    background: BackgroundTasks,
):
    """PENDING -> ACTIVE approves it. PENDING/ACTIVE -> CANCELLED cancels it.

    Any other transition is rejected with 409.
    """
    purchase = purchase_service.get_purchase_or_404(db, purchase_id)
    purchase = purchase_service.change_status(
        db,
        purchase=purchase,
        new_status=payload.status,
        actor=admin,
        note=payload.note,
        background=background,
    )
    return {
        **purchase_payload(purchase),
        "status_history": purchase.status_history,
        "customer": purchase.user,
    }
