"""Service request, technician and activity-history schemas."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import PhotoCategory, ServiceRequestStatus, ServiceType
from app.schemas.ac_unit import AcUnitBrief
from app.schemas.common import ORMModel
from app.schemas.photo import PhotoOut
from app.schemas.user import UserSummary


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


# --- Requests from clients ---------------------------------------------------


class ServiceRequestCreate(BaseModel):
    ac_unit_id: int = Field(gt=0)
    service_type: ServiceType
    description: str = Field(min_length=10, max_length=2000)

    @field_validator("description")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Please describe the issue in at least 10 characters.")
        return value


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def _clean_note(cls, value):
        return _clean(value)


class ReasonIn(BaseModel):
    """A reason is mandatory when rejecting."""

    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Please give a reason.")
        return value


class AssignIn(BaseModel):
    technician_id: int = Field(gt=0)


class ReportUpdate(BaseModel):
    """Technician report fields. Only fields that are sent are changed."""

    inspection_findings: str | None = Field(default=None, max_length=5000)
    proposed_work: str | None = Field(default=None, max_length=5000)
    work_performed: str | None = Field(default=None, max_length=5000)
    parts_used: str | None = Field(default=None, max_length=2000)
    technician_notes: str | None = Field(default=None, max_length=5000)

    @field_validator(
        "inspection_findings", "proposed_work", "work_performed", "parts_used", "technician_notes"
    )
    @classmethod
    def _clean_fields(cls, value):
        return _clean(value)


class CustomerDecisionIn(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def _clean_note(cls, value):
        return _clean(value)


# --- Responses ---------------------------------------------------------------


class TechnicianBrief(ORMModel):
    id: int
    first_name: str
    last_name: str
    phone: str | None = None


class PlanBrief(BaseModel):
    purchase_id: int
    plan_name: str


class ServiceRequestListOut(BaseModel):
    id: int
    status: ServiceRequestStatus
    service_type: ServiceType
    created_at: datetime
    updated_at: datetime
    ac_unit: AcUnitBrief
    technician: TechnicianBrief | None = None
    # Staff views only.
    customer: UserSummary | None = None


class ServiceRequestDetailOut(ServiceRequestListOut):
    description: str
    status_reason: str | None
    inspection_findings: str | None
    proposed_work: str | None
    work_performed: str | None
    parts_used: str | None
    customer_decision_note: str | None
    reviewed_at: datetime | None
    decided_at: datetime | None
    assigned_at: datetime | None
    inspection_started_at: datetime | None
    work_started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    plan: PlanBrief
    photo_recommended: bool
    photos: list[PhotoOut] = Field(default_factory=list)
    # Photos of the AC unit taken at registration.
    ac_unit_photos: list[PhotoOut] = Field(default_factory=list)
    # What the viewer may upload right now (drives the UI).
    allowed_upload_categories: list[PhotoCategory] = Field(default_factory=list)
    # Staff views only.
    technician_notes: str | None = None
    customer_address: str | None = None


class ActivityEventOut(BaseModel):
    event_id: str
    event_type: str
    event_timestamp: str
    actor_role: str
    description: str
    previous_status: str | None = None
    new_status: str | None = None
    # Staff views only.
    actor_id: str | None = None
    technician_id: str | None = None


# --- Technician accounts (admin) --------------------------------------------


class TechnicianCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    password: str = Field(min_length=8, max_length=128)


class TechnicianUpdate(BaseModel):
    phone: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class TechnicianOut(ORMModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None
    is_active: bool
    created_at: datetime
    open_jobs: int = 0
