"""AC unit registration schemas."""

from datetime import date, datetime, timezone

from pydantic import BaseModel, Field, field_validator

from app.models.enums import AcType, ReportedCondition
from app.schemas.common import ORMModel
from app.schemas.photo import PhotoOut
from app.schemas.user import _normalise_state


def _not_in_future(value: date | None) -> date | None:
    if value is not None and value > datetime.now(timezone.utc).date():
        raise ValueError("Installation date cannot be in the future.")
    return value


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class AcUnitCreate(BaseModel):
    brand: str = Field(min_length=1, max_length=80)
    model_number: str = Field(min_length=1, max_length=80)
    serial_number: str | None = Field(default=None, max_length=80)
    ac_type: AcType
    address: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=120)
    state: str = Field(min_length=2, max_length=2)
    zip_code: str = Field(min_length=3, max_length=10)
    installation_date: date | None = None
    reported_condition: ReportedCondition = ReportedCondition.UNKNOWN
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("state")
    @classmethod
    def _validate_state(cls, value):
        return _normalise_state(value)

    @field_validator("installation_date")
    @classmethod
    def _validate_install_date(cls, value):
        return _not_in_future(value)

    @field_validator("serial_number", "notes")
    @classmethod
    def _blank_optional(cls, value):
        return _blank_to_none(value)


class AcUnitUpdate(BaseModel):
    """All fields optional - only what is sent gets changed."""

    brand: str | None = Field(default=None, min_length=1, max_length=80)
    model_number: str | None = Field(default=None, min_length=1, max_length=80)
    serial_number: str | None = Field(default=None, max_length=80)
    ac_type: AcType | None = None
    address: str | None = Field(default=None, min_length=1, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=120)
    state: str | None = Field(default=None, min_length=2, max_length=2)
    zip_code: str | None = Field(default=None, min_length=3, max_length=10)
    installation_date: date | None = None
    reported_condition: ReportedCondition | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("state")
    @classmethod
    def _validate_state(cls, value):
        return _normalise_state(value)

    @field_validator("installation_date")
    @classmethod
    def _validate_install_date(cls, value):
        return _not_in_future(value)

    @field_validator("serial_number", "notes")
    @classmethod
    def _blank_optional(cls, value):
        return _blank_to_none(value)


class AcUnitBrief(ORMModel):
    """Enough to identify a unit on a service request."""

    id: int
    brand: str
    model_number: str
    serial_number: str | None
    ac_type: AcType
    address: str
    city: str
    state: str
    zip_code: str
    installation_date: date | None
    reported_condition: ReportedCondition


class AcUnitOut(AcUnitBrief):
    customer_id: int
    purchase_id: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    plan_name: str | None = None
    has_open_request: bool = False
    photos: list[PhotoOut] = Field(default_factory=list)
