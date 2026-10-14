"""Service request endpoints for customers, admins and technicians.

Each action is its own endpoint and maps to one lifecycle transition; the
service layer re-validates the role, ownership and preconditions of every
change, so nothing depends on the frontend hiding a button.
"""

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.core.deps import AdminUser, CurrentUser, CustomerUser, DbSession, TechnicianUser
from app.models import ServiceRequestStatus
from app.schemas.photo import PhotoUploadResponse, ServiceRequestPhotoUploadRequest
from app.schemas.service_request import (
    ActivityEventOut,
    AppointmentIn,
    AssignIn,
    CustomerDecisionIn,
    EligibleTechnicianOut,
    NoteIn,
    ProvideInfoIn,
    ReasonIn,
    ReportUpdate,
    ServiceRequestCreate,
    ServiceRequestDetailOut,
    ServiceRequestListOut,
)
from app.services import activity, notifications, photo_service, scheduling_service
from app.services import service_request_service as svc

router = APIRouter(prefix="/api/service-requests", tags=["Service Requests"])


def _done(db, request, viewer, background: BackgroundTasks) -> ServiceRequestDetailOut:
    """Push the queued activity event to DynamoDB after the response is sent."""
    background.add_task(activity.deliver_pending)
    return svc.detail(db, request, viewer)


# --- Customer ---------------------------------------------------------------


@router.post(
    "",
    response_model=ServiceRequestDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a service request",
)
def create_service_request(
    payload: ServiceRequestCreate, db: DbSession, customer: CustomerUser, background: BackgroundTasks
):
    request = svc.create_request(db, customer=customer, payload=payload)
    return _done(db, request, customer, background)


@router.get("/me", response_model=list[ServiceRequestListOut], summary="My service requests")
def list_my_service_requests(db: DbSession, customer: CustomerUser):
    return [svc.list_row(r, customer) for r in svc.list_for_customer(db, customer)]


@router.post(
    "/{request_id}/customer-decision",
    response_model=ServiceRequestDetailOut,
    summary="Approve or decline proposed work",
)
def customer_decision(
    request_id: int,
    payload: CustomerDecisionIn,
    db: DbSession,
    customer: CustomerUser,
    background: BackgroundTasks,
):
    request = svc.get_for_viewer(db, request_id, customer, lock=True)
    request = svc.customer_decision(
        db, request=request, customer=customer, approve=payload.approve, note=payload.note
    )
    return _done(db, request, customer, background)


@router.post(
    "/{request_id}/provide-info",
    response_model=ServiceRequestDetailOut,
    summary="Answer an information request (customer)",
)
def provide_info(
    request_id: int,
    payload: ProvideInfoIn,
    db: DbSession,
    customer: CustomerUser,
    background: BackgroundTasks,
):
    request = svc.get_for_viewer(db, request_id, customer, lock=True)
    request = svc.provide_info(db, request=request, customer=customer, note=payload.note)
    return _done(db, request, customer, background)


# --- Technician ---------------------------------------------------------------


@router.get(
    "/assigned", response_model=list[ServiceRequestListOut], summary="My assigned jobs (technician)"
)
def list_assigned(
    db: DbSession,
    technician: TechnicianUser,
    include_closed: bool = Query(default=False),
):
    jobs = svc.list_for_technician(db, technician, open_only=not include_closed)
    return [svc.list_row(r, technician) for r in jobs]


@router.post(
    "/{request_id}/start-inspection",
    response_model=ServiceRequestDetailOut,
    summary="Start the inspection (technician)",
)
def start_inspection(
    request_id: int, db: DbSession, technician: TechnicianUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, technician, lock=True)
    request = svc.start_inspection(db, request=request, technician=technician)
    return _done(db, request, technician, background)


@router.put(
    "/{request_id}/report",
    response_model=ServiceRequestDetailOut,
    summary="Update findings, work and parts (technician)",
)
def update_report(
    request_id: int,
    payload: ReportUpdate,
    db: DbSession,
    technician: TechnicianUser,
    background: BackgroundTasks,
):
    request = svc.get_for_viewer(db, request_id, technician, lock=True)
    request = svc.update_report(db, request=request, technician=technician, payload=payload)
    return _done(db, request, technician, background)


@router.post(
    "/{request_id}/request-customer-approval",
    response_model=ServiceRequestDetailOut,
    summary="Ask the customer to approve proposed work (technician)",
)
def request_customer_approval(
    request_id: int, db: DbSession, technician: TechnicianUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, technician, lock=True)
    request = svc.request_customer_approval(db, request=request, technician=technician)
    return _done(db, request, technician, background)


@router.post(
    "/{request_id}/start-work",
    response_model=ServiceRequestDetailOut,
    summary="Start the repair (technician)",
)
def start_work(request_id: int, db: DbSession, technician: TechnicianUser, background: BackgroundTasks):
    request = svc.get_for_viewer(db, request_id, technician, lock=True)
    request = svc.start_work(db, request=request, technician=technician)
    return _done(db, request, technician, background)


@router.post(
    "/{request_id}/complete",
    response_model=ServiceRequestDetailOut,
    summary="Mark the job completed (technician)",
)
def complete(request_id: int, db: DbSession, technician: TechnicianUser, background: BackgroundTasks):
    request = svc.get_for_viewer(db, request_id, technician, lock=True)
    request = svc.complete(db, request=request, technician=technician)
    return _done(db, request, technician, background)


# --- Admin ----------------------------------------------------------------------


@router.get("", response_model=list[ServiceRequestListOut], summary="All service requests (admin)")
def list_service_requests(
    db: DbSession,
    admin: AdminUser,
    status_filter: ServiceRequestStatus | None = Query(default=None, alias="status"),
    technician_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(
        default=None, max_length=120, description="Matches customer name/email or AC brand/model."
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    requests = svc.list_for_admin(
        db,
        status_filter=status_filter,
        technician_id=technician_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    return [svc.list_row(r, admin) for r in requests]


@router.post(
    "/{request_id}/review", response_model=ServiceRequestDetailOut, summary="Start review (admin)"
)
def start_review(request_id: int, db: DbSession, admin: AdminUser, background: BackgroundTasks):
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request = svc.start_review(db, request=request, admin=admin)
    return _done(db, request, admin, background)


@router.post(
    "/{request_id}/approve", response_model=ServiceRequestDetailOut, summary="Approve (admin)"
)
def approve(
    request_id: int, payload: NoteIn, db: DbSession, admin: AdminUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request = svc.approve(db, request=request, admin=admin, note=payload.note)
    return _done(db, request, admin, background)


@router.post(
    "/{request_id}/reject", response_model=ServiceRequestDetailOut, summary="Reject (admin)"
)
def reject(
    request_id: int, payload: ReasonIn, db: DbSession, admin: AdminUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request = svc.reject(db, request=request, admin=admin, reason=payload.reason)
    return _done(db, request, admin, background)


@router.post(
    "/{request_id}/request-info",
    response_model=ServiceRequestDetailOut,
    summary="Ask the customer for more information (admin)",
)
def request_info(
    request_id: int, payload: ReasonIn, db: DbSession, admin: AdminUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request = svc.request_info(db, request=request, admin=admin, reason=payload.reason)
    return _done(db, request, admin, background)


@router.get(
    "/{request_id}/eligible-technicians",
    response_model=list[EligibleTechnicianOut],
    summary="Technicians who serve this claim's location, best match first (admin)",
)
def eligible_technicians(request_id: int, db: DbSession, admin: AdminUser):
    request = svc.get_for_viewer(db, request_id, admin)
    return scheduling_service.eligible_technicians(db, request)


@router.post(
    "/{request_id}/appointment",
    response_model=ServiceRequestDetailOut,
    summary="Assign a technician and confirm a visit time (admin)",
)
def schedule_appointment(
    request_id: int, payload: AppointmentIn, db: DbSession, admin: AdminUser, background: BackgroundTasks
):
    """Times are in the property's local time zone. Rejects overlapping visits."""
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request, appointment = scheduling_service.schedule(db, request=request, admin=admin, payload=payload)
    unit, tech, customer = request.ac_unit, appointment.technician, request.customer
    background.add_task(
        notifications.send_appointment_confirmed_emails,
        claim_id=request.id,
        visit_time=scheduling_service.format_local(appointment.start_at, appointment.timezone),
        address=f"{unit.address}, {unit.city}, {unit.state} {unit.zip_code}",
        equipment=f"{unit.brand} {unit.model_number}",
        technician_name=f"{tech.first_name} {tech.last_name}",
        technician_email=tech.email,
        technician_first_name=tech.first_name,
        customer_email=customer.email,
        customer_first_name=customer.first_name,
    )
    return _done(db, request, admin, background)


@router.post(
    "/{request_id}/assign",
    response_model=ServiceRequestDetailOut,
    summary="Assign or reassign a technician (admin)",
)
def assign(
    request_id: int, payload: AssignIn, db: DbSession, admin: AdminUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, admin, lock=True)
    request = svc.assign(db, request=request, admin=admin, technician_id=payload.technician_id)
    return _done(db, request, admin, background)


# --- Shared ---------------------------------------------------------------------


@router.get(
    "/{request_id}", response_model=ServiceRequestDetailOut, summary="Service request detail"
)
def get_service_request(request_id: int, db: DbSession, user: CurrentUser):
    """Customers see their own, technicians their assigned jobs, admins everything."""
    return svc.detail(db, svc.get_for_viewer(db, request_id, user), user)


@router.post(
    "/{request_id}/cancel",
    response_model=ServiceRequestDetailOut,
    summary="Cancel (customer before work starts, or admin)",
)
def cancel(
    request_id: int, payload: NoteIn, db: DbSession, user: CurrentUser, background: BackgroundTasks
):
    request = svc.get_for_viewer(db, request_id, user, lock=True)
    request = svc.cancel(db, request=request, actor=user, note=payload.note)
    return _done(db, request, user, background)


@router.get(
    "/{request_id}/history",
    response_model=list[ActivityEventOut],
    summary="Activity history (filtered for customers)",
)
def get_history(request_id: int, db: DbSession, user: CurrentUser):
    svc.get_for_viewer(db, request_id, user)
    return activity.view_for(activity.list_events(db, request_id), user)


@router.post(
    "/{request_id}/photos/upload-url",
    response_model=PhotoUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Get a short-lived upload URL for a request photo",
)
def create_request_photo_upload(
    request_id: int, payload: ServiceRequestPhotoUploadRequest, db: DbSession, user: CurrentUser
):
    request = svc.get_for_viewer(db, request_id, user)
    return photo_service.create_request_upload(
        db, actor=user, request=request, category=payload.category, payload=payload
    )
