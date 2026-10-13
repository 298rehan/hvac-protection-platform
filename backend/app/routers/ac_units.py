"""AC unit registration endpoints.

Customers manage their own units. Admins can read any unit; technicians can read
units they have a job on.
"""

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, CustomerUser, DbSession
from app.models import AcUnit
from app.schemas.ac_unit import AcUnitCreate, AcUnitOut, AcUnitUpdate
from app.schemas.photo import PhotoUploadRequest, PhotoUploadResponse
from app.services import ac_unit_service, photo_service

router = APIRouter(prefix="/api/ac-units", tags=["AC Units"])


@router.post(
    "",
    response_model=AcUnitOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register an AC unit under my plan",
)
def create_ac_unit(payload: AcUnitCreate, db: DbSession, customer: CustomerUser):
    unit = ac_unit_service.create_unit(db, customer=customer, payload=payload)
    return ac_unit_service.serialise(db, unit)


@router.get("/me", response_model=list[AcUnitOut], summary="My AC units")
def list_my_ac_units(db: DbSession, customer: CustomerUser):
    units = db.execute(
        select(AcUnit).where(AcUnit.customer_id == customer.id).order_by(AcUnit.created_at)
    ).scalars()
    return [ac_unit_service.serialise(db, u) for u in units]


@router.get("", response_model=list[AcUnitOut], summary="A customer's AC units (admin)")
def list_ac_units(db: DbSession, _: AdminUser, customer_id: int = Query(gt=0)):
    units = db.execute(
        select(AcUnit).where(AcUnit.customer_id == customer_id).order_by(AcUnit.created_at)
    ).scalars()
    return [ac_unit_service.serialise(db, u) for u in units]


@router.get("/{unit_id}", response_model=AcUnitOut, summary="AC unit detail")
def get_ac_unit(unit_id: int, db: DbSession, user: CurrentUser):
    return ac_unit_service.serialise(db, ac_unit_service.get_for_viewer(db, unit_id, user))


@router.patch("/{unit_id}", response_model=AcUnitOut, summary="Update my AC unit")
def update_ac_unit(unit_id: int, payload: AcUnitUpdate, db: DbSession, customer: CustomerUser):
    unit = ac_unit_service.get_owned(db, unit_id, customer)
    unit = ac_unit_service.update_unit(db, unit=unit, payload=payload)
    return ac_unit_service.serialise(db, unit)


@router.delete(
    "/{unit_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove my AC unit"
)
def delete_ac_unit(unit_id: int, db: DbSession, customer: CustomerUser):
    unit = ac_unit_service.get_owned(db, unit_id, customer)
    ac_unit_service.delete_unit(db, unit=unit)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{unit_id}/attach-current-plan",
    response_model=AcUnitOut,
    summary="Cover this unit under my current plan",
)
def attach_ac_unit(unit_id: int, db: DbSession, customer: CustomerUser):
    unit = ac_unit_service.get_owned(db, unit_id, customer)
    unit = ac_unit_service.attach_to_current_plan(db, unit=unit, customer=customer)
    return ac_unit_service.serialise(db, unit)


@router.post(
    "/{unit_id}/photos/upload-url",
    response_model=PhotoUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Get a short-lived upload URL for an initial-condition photo",
)
def create_ac_unit_photo_upload(
    unit_id: int, payload: PhotoUploadRequest, db: DbSession, customer: CustomerUser
):
    unit = ac_unit_service.get_owned(db, unit_id, customer)
    return photo_service.create_ac_unit_upload(db, actor=customer, unit=unit, payload=payload)
