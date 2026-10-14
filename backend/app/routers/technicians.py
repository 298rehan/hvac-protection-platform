"""Technician account management (admin only).

Technicians never self-register: an admin creates the account and shares the
initial password out of band.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.core.security import hash_password
from app.models import (
    TERMINAL_SERVICE_REQUEST_STATUSES,
    ServiceRequest,
    TechnicianProfile,
    User,
    UserRole,
)
from app.schemas.service_request import (
    TechnicianCreate,
    TechnicianOut,
    TechnicianProfileIn,
    TechnicianUpdate,
)

router = APIRouter(prefix="/api/technicians", tags=["Technicians"])


def _open_jobs(db, technician_id: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ServiceRequest)
        .where(
            ServiceRequest.assigned_technician_id == technician_id,
            ServiceRequest.status.not_in(TERMINAL_SERVICE_REQUEST_STATUSES),
        )
    )


def _out(db, tech: User) -> TechnicianOut:
    out = TechnicianOut.model_validate(tech)
    out.open_jobs = _open_jobs(db, tech.id)
    profile = db.get(TechnicianProfile, tech.id)
    if profile is not None:
        out.service_states = profile.service_states or []
        out.service_zip_prefixes = profile.service_zip_prefixes or []
        out.specialties = profile.specialties or []
    return out


def _get_or_404(db, technician_id: int) -> User:
    tech = db.get(User, technician_id)
    if tech is None or tech.role is not UserRole.TECHNICIAN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Technician {technician_id} was not found.",
        )
    return tech


@router.get("", response_model=list[TechnicianOut], summary="All technicians (admin)")
def list_technicians(db: DbSession, _: AdminUser, active_only: bool = False):
    stmt = select(User).where(User.role == UserRole.TECHNICIAN)
    if active_only:
        stmt = stmt.where(User.is_active.is_(True))
    techs = db.execute(stmt.order_by(User.first_name, User.last_name)).scalars()
    return [_out(db, t) for t in techs]


@router.post(
    "",
    response_model=TechnicianOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a technician account (admin)",
)
def create_technician(payload: TechnicianCreate, db: DbSession, _: AdminUser):
    email = payload.email.strip().lower()
    if db.execute(select(User.id).where(func.lower(User.email) == email)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )
    tech = User(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.TECHNICIAN,
        phone=payload.phone.strip() if payload.phone else None,
    )
    db.add(tech)
    db.commit()
    db.refresh(tech)
    return _out(db, tech)


@router.patch("/{technician_id}", response_model=TechnicianOut, summary="Update a technician (admin)")
def update_technician(technician_id: int, payload: TechnicianUpdate, db: DbSession, _: AdminUser):
    tech = _get_or_404(db, technician_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_active") is False and _open_jobs(db, tech.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reassign this technician's open jobs before deactivating the account.",
        )
    for field, value in data.items():
        if field == "is_active" and value is None:
            continue
        setattr(tech, field, value)
    db.commit()
    db.refresh(tech)
    return _out(db, tech)


@router.put(
    "/{technician_id}/profile",
    response_model=TechnicianOut,
    summary="Set a technician's service area and specialties (admin)",
)
def update_technician_profile(
    technician_id: int, payload: TechnicianProfileIn, db: DbSession, _: AdminUser
):
    tech = _get_or_404(db, technician_id)
    profile = db.get(TechnicianProfile, tech.id) or TechnicianProfile(user_id=tech.id)
    profile.service_states = payload.service_states
    profile.service_zip_prefixes = payload.service_zip_prefixes
    profile.specialties = [s.value for s in payload.specialties]
    db.add(profile)
    db.commit()
    return _out(db, tech)
