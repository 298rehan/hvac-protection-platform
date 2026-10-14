"""Service request, technician and activity-history schemas."""

import re
from datetime import date, datetime, time

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.regions import US_STATES
from app.models.enums import (
    AcType,
    AppointmentStatus,
    PhotoCategory,
    PreferredWindow,
    ServiceRequestStatus,
    ServiceType,
)
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


class PreferredWindowIn(BaseModel):
    date: date
    window: PreferredWindow


class ServiceRequestCreate(BaseModel):
    ac_unit_id: int = Field(gt=0)
    service_type: ServiceType
    description: str = Field(min_length=10, max_length=2000)
    # Up to 5 preferred visit windows (property local time). Preferences only.
    preferred_windows: list[PreferredWindowIn] = Field(default_factory=list, max_length=5)

    @field_validator("preferred_windows")
    @classmethod
    def _unique_windows(cls, value: list[PreferredWindowIn]) -> list[PreferredWindowIn]:
        if len({(w.date, w.window) for w in value}) != len(value):
            raise ValueError("Each preferred date and time window can only be chosen once.")
        return value

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


class ProvideInfoIn(BaseModel):
    note: str = Field(min_length=3, max_length=2000)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Please add the requested information.")
        return value


class AppointmentIn(BaseModel):
    """Visit time in the PROPERTY's local time zone; stored in UTC."""

    technician_id: int = Field(gt=0)
    date: date
    start_time: time
    duration_minutes: int = Field(default=120, ge=30, le=480)


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


class PreferredWindowOut(BaseModel):
    date: date
    window: PreferredWindow


class AppointmentOut(ORMModel):
    id: int
    technician: TechnicianBrief
    start_at: datetime
    end_at: datetime
    timezone: str
    status: AppointmentStatus


class ServiceRequestListOut(BaseModel):
    id: int
    status: ServiceRequestStatus
    service_type: ServiceType
    created_at: datetime
    updated_at: datetime
    ac_unit: AcUnitBrief
    technician: TechnicianBrief | None = None
    # Property time zone and the confirmed visit, if any.
    timezone: str = "UTC"
    appointment: AppointmentOut | None = None
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
    info_request_note: str | None = None
    info_response_note: str | None = None
    preferred_windows: list[PreferredWindowOut] = Field(default_factory=list)
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


_ZIP_PREFIX = re.compile(r"^\d{3,5}$")


class TechnicianProfileIn(BaseModel):
    """Where a technician works and what equipment they specialise in."""

    service_states: list[str] = Field(default_factory=list, max_length=60)
    service_zip_prefixes: list[str] = Field(default_factory=list, max_length=200)
    specialties: list[AcType] = Field(default_factory=list)

    @field_validator("service_states")
    @classmethod
    def _states(cls, value: list[str]) -> list[str]:
        codes = sorted({v.strip().upper() for v in value if v.strip()})
        bad = [c for c in codes if c not in US_STATES]
        if bad:
            raise ValueError(f"Unknown state code(s): {', '.join(bad)}.")
        return codes

    @field_validator("service_zip_prefixes")
    @classmethod
    def _zips(cls, value: list[str]) -> list[str]:
        prefixes = sorted({v.strip() for v in value if v.strip()})
        bad = [p for p in prefixes if not _ZIP_PREFIX.match(p)]
        if bad:
            raise ValueError("ZIP prefixes must be 3 to 5 digits, e.g. 770 or 77494.")
        return prefixes

    @field_validator("specialties")
    @classmethod
    def _unique_specialties(cls, value: list[AcType]) -> list[AcType]:
        return list(dict.fromkeys(value))


class TechnicianOut(ORMModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None
    is_active: bool
    created_at: datetime
    open_jobs: int = 0
    service_states: list[str] = Field(default_factory=list)
    service_zip_prefixes: list[str] = Field(default_factory=list)
    specialties: list[AcType] = Field(default_factory=list)


class BusySlot(BaseModel):
    start_at: datetime
    end_at: datetime


class EligibleTechnicianOut(BaseModel):
    """A technician whose service area covers the claim's property."""

    id: int
    first_name: str
    last_name: str
    phone: str | None
    service_states: list[str]
    service_zip_prefixes: list[str]
    specialties: list[AcType]
    area_match: str  # "zip" (matched a ZIP prefix) or "state" (whole-state coverage)
    specialty_match: bool
    open_jobs: int
    # Customer preferred windows this technician has no confirmed visit in.
    free_preferred_windows: list[PreferredWindowOut]
    # Confirmed visits in the next 14 days (for the admin's calendar check).
    upcoming_appointments: list[BusySlot]
