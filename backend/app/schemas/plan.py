"""Plan and regional-pricing schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.regions import US_STATES, state_name
from app.schemas.common import ORMModel


def _normalise_state_code(value: str) -> str:
    code = value.strip().upper()
    if code not in US_STATES:
        raise ValueError(f"'{value}' is not a valid US state code.")
    return code


class PlanRegionIn(BaseModel):
    """One state a plan is sold in, with the price charged there."""

    state_code: str = Field(min_length=2, max_length=2, examples=["FL"])
    monthly_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2, examples=["19.99"])
    annual_price: Decimal | None = Field(
        default=None, gt=0, max_digits=10, decimal_places=2, examples=["209.99"]
    )
    is_available: bool = True

    @field_validator("state_code")
    @classmethod
    def _validate_state(cls, value: str) -> str:
        return _normalise_state_code(value)


class PlanRegionOut(ORMModel):
    id: int
    state_code: str
    state_name: str = ""
    monthly_price: Decimal
    annual_price: Decimal | None = None
    is_available: bool

    @classmethod
    def from_model(cls, region) -> "PlanRegionOut":
        return cls(
            id=region.id,
            state_code=region.state_code,
            state_name=state_name(region.state_code),
            monthly_price=region.monthly_price,
            annual_price=region.annual_price,
            is_available=region.is_available,
        )


class PlanCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120, examples=["HVAC Elite Protection"])
    description: str = Field(
        default="", max_length=2000, examples=["Premium HVAC maintenance and protection coverage."]
    )
    features: list[str] = Field(
        default_factory=list,
        examples=[["Annual inspection", "Priority service", "Emergency service"]],
    )
    base_monthly_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2, examples=["59.99"])
    base_annual_price: Decimal | None = Field(
        default=None, gt=0, max_digits=10, decimal_places=2, examples=["629.99"]
    )
    is_active: bool = True
    display_order: int = 0
    regions: list[PlanRegionIn] = Field(default_factory=list)

    @field_validator("features")
    @classmethod
    def _clean_features(cls, value: list[str]) -> list[str]:
        cleaned = [f.strip() for f in value if f and f.strip()]
        if len(cleaned) > 25:
            raise ValueError("A plan can list at most 25 features.")
        return cleaned

    @field_validator("regions")
    @classmethod
    def _unique_states(cls, value: list[PlanRegionIn]) -> list[PlanRegionIn]:
        codes = [r.state_code for r in value]
        if len(codes) != len(set(codes)):
            raise ValueError("Each state may only be listed once per plan.")
        return value


class PlanUpdate(BaseModel):
    """All fields optional - only what is sent gets changed."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    features: list[str] | None = None
    base_monthly_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    base_annual_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    is_active: bool | None = None
    display_order: int | None = None
    # When present, this list fully replaces the plan's regional pricing.
    regions: list[PlanRegionIn] | None = None

    @field_validator("features")
    @classmethod
    def _clean_features(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [f.strip() for f in value if f and f.strip()]

    @field_validator("regions")
    @classmethod
    def _unique_states(cls, value: list[PlanRegionIn] | None) -> list[PlanRegionIn] | None:
        if value is None:
            return None
        codes = [r.state_code for r in value]
        if len(codes) != len(set(codes)):
            raise ValueError("Each state may only be listed once per plan.")
        return value


class PlanOut(ORMModel):
    """Full plan record. Used by the admin app and the plan-details page."""

    id: int
    name: str
    slug: str
    description: str
    features: list[str]
    base_monthly_price: Decimal
    base_annual_price: Decimal | None
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    regions: list[PlanRegionOut] = Field(default_factory=list)


class PlanPublicOut(ORMModel):
    """What the customer app sees: one plan priced for one specific state."""

    id: int
    name: str
    slug: str
    description: str
    features: list[str]
    display_order: int
    state_code: str
    state_name: str
    monthly_price: Decimal
    annual_price: Decimal | None
    available_in_region: bool
