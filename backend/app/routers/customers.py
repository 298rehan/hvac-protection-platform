"""Admin-only customer directory, plus the customer's own profile endpoints."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import AdminUser, CustomerUser, DbSession
from app.core.security import hash_password, verify_password
from app.models import Purchase, PurchaseStatus, User, UserRole
from app.schemas.common import MessageResponse
from app.schemas.purchase import PurchaseOut
from app.schemas.user import PasswordChange, ProfileUpdate, UserOut, UserSummary
from app.services.purchase_service import purchase_payload

router = APIRouter(tags=["Customers"])


# --- Customer's own profile ------------------------------------------------


@router.put("/api/customers/me", response_model=UserOut, summary="Update my profile")
def update_my_profile(payload: ProfileUpdate, db: DbSession, customer: CustomerUser):
    """Email and role are intentionally not editable here."""
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(customer, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(customer)
    return customer


@router.put(
    "/api/customers/me/password",
    response_model=MessageResponse,
    summary="Change my password",
)
def change_my_password(payload: PasswordChange, db: DbSession, customer: CustomerUser):
    if not verify_password(payload.current_password, customer.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect.",
        )
    customer.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Your password has been updated.")


# --- Admin customer directory ---------------------------------------------


@router.get(
    "/api/customers",
    response_model=list[UserSummary],
    summary="List customers (admin)",
)
def list_customers(
    db: DbSession,
    _: AdminUser,
    search: str | None = Query(default=None, max_length=120, description="Name, email or city."),
    state: str | None = Query(default=None, min_length=2, max_length=2),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(User).where(User.role == UserRole.CUSTOMER)

    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(needle),
                func.lower(User.first_name + " " + User.last_name).like(needle),
                func.lower(func.coalesce(User.city, "")).like(needle),
            )
        )
    if state:
        stmt = stmt.where(User.state == state.upper())

    stmt = stmt.order_by(User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


def _get_customer_or_404(db, customer_id: int) -> User:
    user = db.get(User, customer_id)
    if user is None or user.role is not UserRole.CUSTOMER:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} was not found.",
        )
    return user


@router.get(
    "/api/customers/{customer_id}",
    response_model=UserOut,
    summary="Customer detail (admin)",
)
def get_customer(customer_id: int, db: DbSession, _: AdminUser):
    """Never includes the password hash - `UserOut` has no such field."""
    return _get_customer_or_404(db, customer_id)


@router.get(
    "/api/customers/{customer_id}/purchases",
    response_model=list[PurchaseOut],
    summary="A customer's purchases (admin)",
)
def get_customer_purchases(customer_id: int, db: DbSession, _: AdminUser):
    _get_customer_or_404(db, customer_id)
    return list(
        db.execute(
            select(Purchase)
            .where(Purchase.user_id == customer_id)
            .order_by(Purchase.created_at.desc(), Purchase.id.desc())
        )
        .unique()
        .scalars()
        .all()
    )


@router.get(
    "/api/customers/{customer_id}/current-plan",
    response_model=PurchaseOut | None,
    summary="A customer's active plan (admin)",
)
def get_customer_current_plan(customer_id: int, db: DbSession, _: AdminUser):
    _get_customer_or_404(db, customer_id)
    purchase = (
        db.execute(
            select(Purchase)
            .where(Purchase.user_id == customer_id, Purchase.status == PurchaseStatus.ACTIVE)
            .order_by(Purchase.activated_at.desc())
        )
        .unique()
        .scalars()
        .first()
    )
    return purchase_payload(purchase) if purchase else None
