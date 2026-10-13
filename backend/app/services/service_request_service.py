"""Business logic for service requests: submission, review, assignment and work.

Every status change goes through `_transition`, which enforces
`SERVICE_REQUEST_TRANSITIONS` (which moves exist and which role may make them)
plus ownership. Action functions add the per-step preconditions. Rows are
locked with SELECT ... FOR UPDATE so two people acting at once cannot both
succeed from the same starting status.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, lazyload

from app.models import (
    PHOTO_RECOMMENDED_SERVICE_TYPES,
    SERVICE_REQUEST_TRANSITIONS,
    TERMINAL_SERVICE_REQUEST_STATUSES,
    AcUnit,
    Photo,
    PhotoCategory,
    PhotoStatus,
    PurchaseStatus,
    ServiceRequest,
    ServiceRequestStatus as S,
    User,
    UserRole,
)
from app.schemas.ac_unit import AcUnitBrief
from app.schemas.service_request import (
    PlanBrief,
    ReportUpdate,
    ServiceRequestCreate,
    ServiceRequestDetailOut,
    ServiceRequestListOut,
    TechnicianBrief,
)
from app.schemas.user import UserSummary
from app.services import ac_unit_service, activity, photo_service

STATUS_LABELS = {
    S.SUBMITTED: "submitted",
    S.UNDER_REVIEW: "under review",
    S.APPROVED: "approved",
    S.REJECTED: "rejected",
    S.ASSIGNED: "assigned",
    S.INSPECTION_IN_PROGRESS: "inspection in progress",
    S.AWAITING_CUSTOMER_APPROVAL: "awaiting customer approval",
    S.IN_PROGRESS: "in progress",
    S.COMPLETED: "completed",
    S.CANCELLED: "cancelled",
}

REPORT_EDITABLE = {S.INSPECTION_IN_PROGRESS, S.AWAITING_CUSTOMER_APPROVAL, S.IN_PROGRESS}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _not_found(request_id: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Service request {request_id} was not found.",
    )


# --- Access -----------------------------------------------------------------


def can_view(request: ServiceRequest, user: User) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if user.role is UserRole.CUSTOMER:
        return request.customer_id == user.id
    return request.assigned_technician_id == user.id


def get_for_viewer(db: Session, request_id: int, user: User, *, lock: bool = False) -> ServiceRequest:
    """Load a request the user may see. 404 (not 403) so ids cannot be probed."""
    stmt = select(ServiceRequest).where(ServiceRequest.id == request_id)
    if lock:
        # The joined AC unit load is dropped so only the request row is locked.
        stmt = stmt.options(lazyload(ServiceRequest.ac_unit)).with_for_update()
    request = db.execute(stmt).unique().scalars().first()
    if request is None or not can_view(request, user):
        raise _not_found(request_id)
    return request


# --- Creation -----------------------------------------------------------------


def create_request(db: Session, *, customer: User, payload: ServiceRequestCreate) -> ServiceRequest:
    unit = ac_unit_service.get_owned(db, payload.ac_unit_id, customer)

    purchase = ac_unit_service.current_purchase(db, customer.id)
    if purchase is None or purchase.status is not PurchaseStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Service requests need an active protection plan.",
        )
    if unit.purchase_id != purchase.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This AC unit is not covered by your active plan. Attach it to the plan first.",
        )
    if ac_unit_service.has_open_request(db, unit.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This AC unit already has an open service request.",
        )

    request = ServiceRequest(
        customer_id=customer.id,
        ac_unit_id=unit.id,
        purchase_id=purchase.id,
        service_type=payload.service_type,
        description=payload.description,
        status=S.SUBMITTED,
    )
    db.add(request)
    db.flush()
    activity.record_event(
        db,
        request_id=request.id,
        event_type=activity.REQUEST_SUBMITTED,
        actor=customer,
        description=f"Service request submitted ({payload.service_type.value.replace('_', ' ').lower()}).",
        new_status=S.SUBMITTED,
    )
    db.commit()
    db.refresh(request)
    return request


# --- Transitions --------------------------------------------------------------


def _check(request: ServiceRequest, new_status: S, actor: User) -> None:
    """Raise unless `actor` may move `request` to `new_status` right now."""
    current = request.status
    roles = SERVICE_REQUEST_TRANSITIONS.get((current, new_status))
    if roles is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A request that is {STATUS_LABELS[current]} cannot be moved to "
                f"{STATUS_LABELS[new_status]}."
            ),
        )
    if actor.role not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to make this change.",
        )
    # Ownership: get_for_viewer already hides other customers' requests and
    # unassigned jobs, but re-checking keeps each transition self-contained.
    if actor.role is UserRole.CUSTOMER and request.customer_id != actor.id:
        raise _not_found(request.id)
    if actor.role is UserRole.TECHNICIAN and request.assigned_technician_id != actor.id:
        raise _not_found(request.id)


def _transition(
    db: Session,
    request: ServiceRequest,
    new_status: S,
    actor: User,
    *,
    event_type: str,
    description: str,
    technician_id: int | None = None,
) -> None:
    _check(request, new_status, actor)
    current = request.status
    now = _now()
    request.status = new_status
    stamp = {
        S.UNDER_REVIEW: "reviewed_at",
        S.APPROVED: "decided_at",
        S.REJECTED: "decided_at",
        S.ASSIGNED: "assigned_at",
        S.INSPECTION_IN_PROGRESS: "inspection_started_at",
        S.IN_PROGRESS: "work_started_at",
        S.COMPLETED: "completed_at",
        S.CANCELLED: "cancelled_at",
    }.get(new_status)
    if stamp:
        setattr(request, stamp, now)

    activity.record_event(
        db,
        request_id=request.id,
        event_type=event_type,
        actor=actor,
        description=description,
        previous_status=current,
        new_status=new_status,
        technician_id=technician_id,
    )


def _commit(db: Session, request: ServiceRequest) -> ServiceRequest:
    db.commit()
    db.refresh(request)
    return request


def start_review(db: Session, *, request: ServiceRequest, admin: User) -> ServiceRequest:
    _transition(
        db, request, S.UNDER_REVIEW, admin,
        event_type=activity.REVIEW_STARTED, description="An administrator started reviewing the request.",
    )
    return _commit(db, request)


def approve(db: Session, *, request: ServiceRequest, admin: User, note: str | None) -> ServiceRequest:
    _transition(
        db, request, S.APPROVED, admin,
        event_type=activity.REQUEST_APPROVED, description="Request approved.",
    )
    request.status_reason = note
    return _commit(db, request)


def reject(db: Session, *, request: ServiceRequest, admin: User, reason: str) -> ServiceRequest:
    _transition(
        db, request, S.REJECTED, admin,
        event_type=activity.REQUEST_REJECTED, description="Request rejected.",
    )
    request.status_reason = reason
    return _commit(db, request)


def _get_technician(db: Session, technician_id: int) -> User:
    tech = db.get(User, technician_id)
    if tech is None or tech.role is not UserRole.TECHNICIAN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="That technician does not exist."
        )
    if not tech.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That technician's account is deactivated.",
        )
    return tech


def assign(db: Session, *, request: ServiceRequest, admin: User, technician_id: int) -> ServiceRequest:
    """Assign an approved request, or reassign one nobody has started yet."""
    tech = _get_technician(db, technician_id)

    if request.status is S.ASSIGNED:
        if request.assigned_technician_id == tech.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The request is already assigned to that technician.",
            )
        request.assigned_technician_id = tech.id
        request.assigned_at = _now()
        activity.record_event(
            db,
            request_id=request.id,
            event_type=activity.TECHNICIAN_REASSIGNED,
            actor=admin,
            description=f"Reassigned to technician {tech.first_name} {tech.last_name[:1]}.",
            technician_id=tech.id,
        )
        return _commit(db, request)

    _check(request, S.ASSIGNED, admin)
    request.assigned_technician_id = tech.id
    _transition(
        db, request, S.ASSIGNED, admin,
        event_type=activity.TECHNICIAN_ASSIGNED,
        description=f"Assigned to technician {tech.first_name} {tech.last_name[:1]}.",
        technician_id=tech.id,
    )
    return _commit(db, request)


def start_inspection(db: Session, *, request: ServiceRequest, technician: User) -> ServiceRequest:
    _transition(
        db, request, S.INSPECTION_IN_PROGRESS, technician,
        event_type=activity.INSPECTION_STARTED, description="The technician started the inspection.",
        technician_id=technician.id,
    )
    return _commit(db, request)


def update_report(
    db: Session, *, request: ServiceRequest, technician: User, payload: ReportUpdate
) -> ServiceRequest:
    if request.assigned_technician_id != technician.id:
        raise _not_found(request.id)
    if request.status not in REPORT_EDITABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The report can only be edited while the job is in progress.",
        )
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update.")
    for field, value in changes.items():
        setattr(request, field, value)
    activity.record_event(
        db,
        request_id=request.id,
        event_type=activity.REPORT_UPDATED,
        actor=technician,
        description="Technician updated the service report.",
        technician_id=technician.id,
        # Report edits can be frequent; the customer sees the report itself.
        visibility=activity.STAFF_ONLY,
    )
    return _commit(db, request)


def _require(value: str | None, message: str) -> None:
    if not value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


def request_customer_approval(db: Session, *, request: ServiceRequest, technician: User) -> ServiceRequest:
    _check(request, S.AWAITING_CUSTOMER_APPROVAL, technician)
    _require(request.inspection_findings, "Record the inspection findings first.")
    _require(request.proposed_work, "Describe the proposed work for the customer first.")
    _transition(
        db, request, S.AWAITING_CUSTOMER_APPROVAL, technician,
        event_type=activity.CUSTOMER_APPROVAL_REQUESTED,
        description="Inspection completed. Waiting for the customer to approve the proposed work.",
        technician_id=technician.id,
    )
    return _commit(db, request)


def start_work(db: Session, *, request: ServiceRequest, technician: User) -> ServiceRequest:
    _check(request, S.IN_PROGRESS, technician)
    _require(request.inspection_findings, "Record the inspection findings first.")
    _transition(
        db, request, S.IN_PROGRESS, technician,
        event_type=activity.REPAIR_STARTED, description="Inspection completed. Repair work started.",
        technician_id=technician.id,
    )
    return _commit(db, request)


def _uploaded_photo_count(db: Session, request_id: int, category: PhotoCategory) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Photo)
        .where(
            Photo.service_request_id == request_id,
            Photo.category == category,
            Photo.status == PhotoStatus.UPLOADED,
        )
    )


def complete(db: Session, *, request: ServiceRequest, technician: User) -> ServiceRequest:
    """Finish the job.

    * Straight from inspection (no repair needed): findings are required.
    * After repair work: a work summary and at least one "after" photo are required.
    """
    _check(request, S.COMPLETED, technician)
    if request.status is S.INSPECTION_IN_PROGRESS:
        _require(request.inspection_findings, "Record the inspection findings first.")
        description = "Inspection completed. No repair was needed."
    else:
        _require(request.work_performed, "Describe the work performed before completing the job.")
        if not _uploaded_photo_count(
            db, request.id, PhotoCategory.AFTER
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Upload at least one 'after' photo of the finished repair first.",
            )
        description = "Repair completed."
    _transition(
        db, request, S.COMPLETED, technician,
        event_type=activity.REQUEST_COMPLETED, description=description,
        technician_id=technician.id,
    )
    return _commit(db, request)


def customer_decision(
    db: Session, *, request: ServiceRequest, customer: User, approve: bool, note: str | None
) -> ServiceRequest:
    if approve:
        _transition(
            db, request, S.IN_PROGRESS, customer,
            event_type=activity.CUSTOMER_APPROVED_WORK,
            description="The customer approved the proposed work.",
        )
    else:
        _transition(
            db, request, S.CANCELLED, customer,
            event_type=activity.CUSTOMER_DECLINED_WORK,
            description="The customer declined the proposed work.",
        )
        request.status_reason = "The customer declined the proposed work."
    request.customer_decision_note = note
    return _commit(db, request)


def cancel(db: Session, *, request: ServiceRequest, actor: User, note: str | None) -> ServiceRequest:
    who = "the customer" if actor.role is UserRole.CUSTOMER else "an administrator"
    _transition(
        db, request, S.CANCELLED, actor,
        event_type=activity.REQUEST_CANCELLED, description=f"Request cancelled by {who}.",
    )
    request.status_reason = note
    return _commit(db, request)


# --- Queries ------------------------------------------------------------------


def list_for_customer(db: Session, customer: User) -> list[ServiceRequest]:
    return list(
        db.execute(
            select(ServiceRequest)
            .where(ServiceRequest.customer_id == customer.id)
            .order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())
        ).unique().scalars()
    )


def list_for_technician(db: Session, technician: User, *, open_only: bool) -> list[ServiceRequest]:
    stmt = select(ServiceRequest).where(ServiceRequest.assigned_technician_id == technician.id)
    if open_only:
        stmt = stmt.where(ServiceRequest.status.not_in(TERMINAL_SERVICE_REQUEST_STATUSES))
    return list(
        db.execute(stmt.order_by(ServiceRequest.updated_at.desc(), ServiceRequest.id.desc()))
        .unique()
        .scalars()
    )


def list_for_admin(
    db: Session,
    *,
    status_filter: S | None,
    technician_id: int | None,
    search: str | None,
    limit: int,
    offset: int,
) -> list[ServiceRequest]:
    stmt = (
        select(ServiceRequest)
        .join(User, User.id == ServiceRequest.customer_id)
        .order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(ServiceRequest.status == status_filter)
    if technician_id is not None:
        stmt = stmt.where(ServiceRequest.assigned_technician_id == technician_id)
    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(needle),
                func.lower(User.first_name + " " + User.last_name).like(needle),
                exists().where(
                    AcUnit.id == ServiceRequest.ac_unit_id,
                    or_(
                        func.lower(AcUnit.brand).like(needle),
                        func.lower(AcUnit.model_number).like(needle),
                    ),
                ),
            )
        )
    return list(db.execute(stmt.limit(limit).offset(offset)).unique().scalars())


# --- Serialisation ------------------------------------------------------------


def _is_staff(user: User) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.TECHNICIAN)


def list_row(request: ServiceRequest, viewer: User) -> ServiceRequestListOut:
    tech = request.assigned_technician
    return ServiceRequestListOut(
        id=request.id,
        status=request.status,
        service_type=request.service_type,
        created_at=request.created_at,
        updated_at=request.updated_at,
        ac_unit=AcUnitBrief.model_validate(request.ac_unit),
        technician=TechnicianBrief.model_validate(tech) if tech else None,
        customer=UserSummary.model_validate(request.customer) if _is_staff(viewer) else None,
    )


def detail(db: Session, request: ServiceRequest, viewer: User) -> ServiceRequestDetailOut:
    photos = db.execute(
        select(Photo)
        .where(Photo.service_request_id == request.id, Photo.status == PhotoStatus.UPLOADED)
        .order_by(Photo.created_at)
    ).scalars()
    unit_photos = db.execute(
        select(Photo)
        .where(Photo.ac_unit_id == request.ac_unit_id, Photo.status == PhotoStatus.UPLOADED)
        .order_by(Photo.created_at)
    ).scalars()
    unit = request.ac_unit
    staff = _is_staff(viewer)
    row = list_row(request, viewer)
    return ServiceRequestDetailOut(
        **row.model_dump(),
        description=request.description,
        status_reason=request.status_reason,
        inspection_findings=request.inspection_findings,
        proposed_work=request.proposed_work,
        work_performed=request.work_performed,
        parts_used=request.parts_used,
        customer_decision_note=request.customer_decision_note,
        reviewed_at=request.reviewed_at,
        decided_at=request.decided_at,
        assigned_at=request.assigned_at,
        inspection_started_at=request.inspection_started_at,
        work_started_at=request.work_started_at,
        completed_at=request.completed_at,
        cancelled_at=request.cancelled_at,
        plan=PlanBrief(purchase_id=request.purchase_id, plan_name=request.purchase.plan.name),
        photo_recommended=request.service_type in PHOTO_RECOMMENDED_SERVICE_TYPES,
        photos=[photo_service.serialise(p) for p in photos],
        ac_unit_photos=[photo_service.serialise(p) for p in unit_photos],
        allowed_upload_categories=photo_service.allowed_request_categories(request, viewer),
        technician_notes=request.technician_notes if staff else None,
        customer_address=(
            f"{unit.address}, {unit.city}, {unit.state} {unit.zip_code}" if staff else None
        ),
    )
