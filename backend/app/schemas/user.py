"""User / customer schemas. A password hash is never present on any of these."""

from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.core.regions import US_STATES, state_name
from app.models.enums import UserRole
from app.schemas.common import ORMModel


def _normalise_state(value: str | None) -> str | None:
    if value is None:
        return None
    code = value.strip().upper()
    if code not in US_STATES:
        raise ValueError("Must be a valid two-letter US state code (for example FL).")
    return code


class UserBase(ORMModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = Field(default=None, max_length=10)


class UserOut(UserBase):
    """Safe public representation of a user."""

    id: int
    role: UserRole
    is_active: bool
    created_at: datetime

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class UserSummary(ORMModel):
    """Compact customer row for admin tables."""

    id: int
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    city: str | None = None
    state: str | None = None
    created_at: datetime


class ProfileUpdate(ORMModel):
    """Fields a customer may change about themselves."""

    first_name: str | None = Field(default=None, min_length=1, max_length=80)
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = Field(default=None, max_length=10)

    @field_validator("state")
    @classmethod
    def _validate_state(cls, value: str | None) -> str | None:
        return _normalise_state(value)


class PasswordChange(ORMModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class RegionOut(ORMModel):
    """A US state, as served by GET /api/regions."""

    code: str
    name: str

    @classmethod
    def from_code(cls, code: str) -> "RegionOut":
        return cls(code=code, name=state_name(code))
