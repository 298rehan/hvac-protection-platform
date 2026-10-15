"""Technician matching and appointment scheduling for claims (service requests).

Matching rule (location first, then ranking):
* A technician is eligible when they are an active TECHNICIAN, the property's
  state is in their `service_states`, and - if they listed ZIP prefixes - the
  property ZIP starts with one of them. Home address is never used.
* Eligible technicians are ranked by: specialty match for the equipment type,
  number of the customer's preferred windows they are free in, fewest open jobs.

Booking rule:
* Times are entered in the property's local time and stored in UTC.
* A technician's row is locked (SELECT ... FOR UPDATE) while booking, so two
  admins booking the same technician at once are serialised; the second one
  sees the first appointment and gets a 409 if they overlap.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.regions import state_timezone
from app.models import (
    PREFERRED_WINDOW_HOURS,
    TERMINAL_SERVICE_REQUEST_STATUSES,
    Appointment,
    AppointmentStatus,
    PreferredWindow,
    ServiceRequest,
    ServiceRequestStatus as S,
    TechnicianProfile,
    User,
    UserRole,
)
from app.schemas.service_request import AppointmentIn
from app.services import activity

MAX_PREFERRED_DAYS_AHEAD = 60
MAX_BOOKING_DAYS_AHEAD = 180


def request_timezone(request: ServiceRequest) -> str:
    return state_timezone(request.ac_unit.state)


# --- Preferred windows ----------------------------------------------------------


def validate_preferred_windows(windows, tz_name: str) -> list[dict]:
    """Check dates are today..+60 days in the property's time zone; return JSON-ready list."""
    today = datetime.now(ZoneInfo(tz_name)).date()
    latest = today + timedelta(days=MAX_PREFERRED_DAYS_AHEAD)
    cleaned = []
    for item in windows:
        if not today <= item.date <= latest:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Preferred dates must be between today and {latest.isoformat()}.",
            )
        cleaned.append({"date": item.date.isoformat(), "window": item.window.value})
    return sorted(cleaned, key=lambda w: (w["date"], list(PreferredWindow).index(PreferredWindow(w["window"]))))


def window_bounds_utc(window: dict, tz_name: str) -> tuple[datetime, datetime]:
    start_hour, end_hour = PREFERRED_WINDOW_HOURS[PreferredWindow(window["window"])]
    day = date.fromisoformat(window["date"])
    zone = ZoneInfo(tz_name)
    start = datetime(day.year, day.month, day.day, start_hour, tzinfo=zone)
    end = datetime(day.year, day.month, day.day, end_hour, tzinfo=zone)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


# --- Appointments ---------------------------------------------------------------


def active_appointment(db: Session, request_id: int) -> Appointment | None:
    return db.execute(
        select(Appointment).where(
            Appointment.service_request_id == request_id,
            Appointment.status == AppointmentStatus.CONFIRMED,
        )
    ).scalars().first()


def confirmed_overlaps(
    db: Session,
    technician_id: int,
    start: datetime,
    end: datetime,
    *,
    exclude_request_id: int | None = None,
    exclude_order_id: int | None = None,
    for_booking: bool = False,
) -> list[Appointment]:
    """Confirmed visits overlapping [start, end).

    `for_booking=True` makes this a locking read. Under MySQL's default
    REPEATABLE READ a plain SELECT reads the transaction's old snapshot and
    could miss an appointment another admin committed a moment ago; a locking
    read always sees the latest committed rows.
    """
    stmt = select(Appointment).where(
        Appointment.technician_id == technician_id,
        Appointment.status == AppointmentStatus.CONFIRMED,
        Appointment.start_at < end,
        Appointment.end_at > start,
    )
    # NULL-safe: an order's appointment has service_request_id NULL, and in SQL
    # "NULL != 5" is not true, so a plain != would silently skip it.
    if exclude_request_id is not None:
        stmt = stmt.where(
            or_(Appointment.service_request_id.is_(None), Appointment.service_request_id != exclude_request_id)
        )
    if exclude_order_id is not None:
        stmt = stmt.where(
            or_(Appointment.service_order_id.is_(None), Appointment.service_order_id != exclude_order_id)
        )
    if for_booking:
        stmt = stmt.with_for_update()
    return list(db.execute(stmt.order_by(Appointment.start_at)).scalars())


def cancel_active_appointment(db: Session, request: ServiceRequest, actor: User, reason: str) -> bool:
    """Cancel the request's confirmed appointment, if any. Caller commits."""
    appointment = active_appointment(db, request.id)
    if appointment is None:
        return False
    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancelled_at = datetime.now(timezone.utc)
    activity.record_event(
        db,
        request_id=request.id,
        event_type=activity.APPOINTMENT_CANCELLED,
        actor=actor,
        description=reason,
        technician_id=appointment.technician_id,
    )
    return True


# --- Matching -------------------------------------------------------------------


def _profile(db: Session, technician_id: int) -> TechnicianProfile | None:
    return db.get(TechnicianProfile, technician_id)


def area_match(profile: TechnicianProfile | None, state: str, zip_code: str) -> str | None:
    """'zip', 'state', or None when the technician does not serve this location."""
    if profile is None or state.upper() not in (profile.service_states or []):
        return None
    prefixes = profile.service_zip_prefixes or []
    if not prefixes:
        return "state"
    return "zip" if any(zip_code.startswith(p) for p in prefixes) else None


def _open_jobs(db: Session, technician_id: int) -> int:
    return len(
        db.execute(
            select(ServiceRequest.id).where(
                ServiceRequest.assigned_technician_id == technician_id,
                ServiceRequest.status.not_in(TERMINAL_SERVICE_REQUEST_STATUSES),
            )
        ).all()
    )


def eligible_technicians(db: Session, request: ServiceRequest) -> list[dict]:
    unit = request.ac_unit
    tz_name = request_timezone(request)
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(User, TechnicianProfile)
        .join(TechnicianProfile, TechnicianProfile.user_id == User.id)
        .where(User.role == UserRole.TECHNICIAN, User.is_active.is_(True))
    ).all()

    results = []
    for tech, profile in rows:
        match = area_match(profile, unit.state, unit.zip_code)
        if match is None:
            continue
        free_windows = []
        for window in request.preferred_windows or []:
            start, end = window_bounds_utc(window, tz_name)
            if start > now and not confirmed_overlaps(db, tech.id, start, end, exclude_request_id=request.id):
                free_windows.append(window)
        upcoming = confirmed_overlaps(db, tech.id, now, now + timedelta(days=14))
        specialties = profile.specialties or []
        results.append(
            {
                "id": tech.id,
                "first_name": tech.first_name,
                "last_name": tech.last_name,
                "phone": tech.phone,
                "service_states": profile.service_states or [],
                "service_zip_prefixes": profile.service_zip_prefixes or [],
                "specialties": specialties,
                "area_match": match,
                "specialty_match": unit.ac_type.value in specialties,
                "open_jobs": _open_jobs(db, tech.id),
                "free_preferred_windows": free_windows,
                "upcoming_appointments": [{"start_at": a.start_at, "end_at": a.end_at} for a in upcoming],
            }
        )

    results.sort(
        key=lambda t: (
            not t["specialty_match"],
            -len(t["free_preferred_windows"]),
            t["open_jobs"],
            t["first_name"],
            t["last_name"],
        )
    )
    return results


# --- Booking --------------------------------------------------------------------


def _visit_bounds(payload: AppointmentIn, tz_name: str) -> tuple[datetime, datetime]:
    local = datetime.combine(payload.date, payload.start_time, tzinfo=ZoneInfo(tz_name))
    start = local.astimezone(timezone.utc)
    end = start + timedelta(minutes=payload.duration_minutes)
    now = datetime.now(timezone.utc)
    if start <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The visit must be in the future.")
    if start > now + timedelta(days=MAX_BOOKING_DAYS_AHEAD):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Visits can be booked up to {MAX_BOOKING_DAYS_AHEAD} days ahead.",
        )
    return start, end


def format_local(moment: datetime, tz_name: str) -> str:
    local = moment.astimezone(ZoneInfo(tz_name))
    return local.strftime("%a %d %b %Y, %I:%M %p %Z").replace(" 0", " ")


def schedule(
    db: Session, *, request: ServiceRequest, admin: User, payload: AppointmentIn
) -> tuple[ServiceRequest, Appointment]:
    """Assign (if needed) and confirm a visit. `request` must be loaded FOR UPDATE."""
    from app.services import service_request_service as svc

    if request.status not in (S.APPROVED, S.ASSIGNED, S.SCHEDULED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A visit can only be scheduled for an approved or assigned claim.",
        )
    tech = svc.get_active_technician(db, payload.technician_id)
    unit = request.ac_unit
    if area_match(_profile(db, tech.id), unit.state, unit.zip_code) is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{tech.first_name} {tech.last_name} does not serve {unit.city}, {unit.state} {unit.zip_code}.",
        )

    tz_name = request_timezone(request)
    start, end = _visit_bounds(payload, tz_name)

    # Serialise bookings per technician, then check for overlaps.
    db.execute(select(User.id).where(User.id == tech.id).with_for_update())
    clashes = confirmed_overlaps(db, tech.id, start, end, exclude_request_id=request.id, for_booking=True)
    if clashes:
        clash = clashes[0]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{tech.first_name} already has a visit from {format_local(clash.start_at, tz_name)} "
                f"to {format_local(clash.end_at, tz_name)}."
            ),
        )

    rescheduling = request.status is S.SCHEDULED
    if rescheduling:
        cancel_active_appointment(db, request, admin, "Previous visit replaced by a new booking.")

    if request.status is S.APPROVED:
        request.assigned_technician_id = tech.id
        svc._transition(
            db, request, S.ASSIGNED, admin,
            event_type=activity.TECHNICIAN_ASSIGNED,
            description=f"Assigned to technician {tech.first_name} {tech.last_name[:1]}.",
            technician_id=tech.id,
        )
    elif request.assigned_technician_id != tech.id:
        request.assigned_technician_id = tech.id
        request.assigned_at = datetime.now(timezone.utc)
        activity.record_event(
            db,
            request_id=request.id,
            event_type=activity.TECHNICIAN_REASSIGNED,
            actor=admin,
            description=f"Reassigned to technician {tech.first_name} {tech.last_name[:1]}.",
            technician_id=tech.id,
        )

    appointment = Appointment(
        service_request_id=request.id,
        technician_id=tech.id,
        start_at=start,
        end_at=end,
        timezone=tz_name,
        status=AppointmentStatus.CONFIRMED,
        created_by_user_id=admin.id,
    )
    db.add(appointment)
    description = f"Technician visit confirmed for {format_local(start, tz_name)}."
    if rescheduling:
        activity.record_event(
            db, request_id=request.id, event_type=activity.APPOINTMENT_CONFIRMED,
            actor=admin, description=description, technician_id=tech.id,
        )
    else:
        svc._transition(
            db, request, S.SCHEDULED, admin,
            event_type=activity.APPOINTMENT_CONFIRMED, description=description, technician_id=tech.id,
        )
    db.commit()
    db.refresh(request)
    db.refresh(appointment)
    return request, appointment
