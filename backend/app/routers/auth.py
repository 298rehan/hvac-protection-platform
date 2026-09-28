"""Registration, login and the current-user endpoint."""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User, UserRole
from app.schemas.auth import CustomerRegisterRequest, LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.services import notifications

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _issue_token(user: User) -> TokenResponse:
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


def _find_by_email(db, email: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    ).scalars().first()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a customer account",
)
def register(payload: CustomerRegisterRequest, db: DbSession, background: BackgroundTasks):
    """Create a CUSTOMER account and sign the new user straight in.

    Admin accounts are never created here - they are provisioned by the seed script.
    """
    if _find_by_email(db, payload.email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email.strip().lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.CUSTOMER,
        phone=payload.phone.strip(),
        address=payload.address.strip(),
        city=payload.city.strip(),
        state=payload.state,
        zip_code=payload.zip_code.strip(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    service_address = f"{user.address}, {user.city}, {user.state} {user.zip_code}"
    background.add_task(
        notifications.send_welcome_email,
        email=user.email,
        first_name=user.first_name,
        state_code=user.state,
        service_address=service_address,
    )
    background.add_task(
        notifications.send_admin_new_customer_email,
        customer_id=user.id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        city=user.city,
        state_code=user.state,
        registered_at=user.created_at,
    )
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse, summary="Customer sign in")
def login(payload: LoginRequest, db: DbSession):
    """Sign in a CUSTOMER. Admins must use /api/auth/admin/login."""
    user = _find_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        # Deliberately vague so this can't be used to enumerate accounts.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated."
        )
    if user.role is not UserRole.CUSTOMER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts must sign in through the admin portal.",
        )
    return _issue_token(user)


@router.post("/admin/login", response_model=TokenResponse, summary="Administrator sign in")
def admin_login(payload: LoginRequest, db: DbSession):
    """Separate entry point for the admin app. Customers are rejected here."""
    user = _find_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated."
        )
    if user.role is not UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This portal is for administrator accounts only.",
        )
    return _issue_token(user)


@router.get("/me", response_model=UserOut, summary="Current signed-in user")
def read_me(user: CurrentUser):
    return user
