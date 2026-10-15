"""Service catalog, pricing quote and discount schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.regions import US_STATES
from app.models.enums import DiscountType, PricingType, ServiceFrequency
from app.schemas.common import ORMModel

Money = Decimal


# --- Categories ---------------------------------------------------------------


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=1000)
    icon: str = Field(default="wrench", max_length=40)
    display_order: int = 0
    is_active: bool = True


class CategoryOut(ORMModel):
    id: int
    name: str
    slug: str
    description: str
    icon: str
    display_order: int
    is_active: bool


class CategoryBrief(ORMModel):
    id: int
    name: str
    slug: str


# --- Services -------------------------------------------------------------------


class AddonIn(BaseModel):
    id: int | None = None  # existing add-on to update; omit to create
    name: str = Field(min_length=2, max_length=120)
    price: Money = Field(ge=0, max_digits=10, decimal_places=2)
    is_active: bool = True


class AddonOut(ORMModel):
    id: int
    name: str
    price: Money
    is_active: bool


class ServiceIn(BaseModel):
    category_id: int = Field(gt=0)
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    icon: str = Field(default="wrench", max_length=40)
    image_url: str | None = Field(default=None, max_length=500)
    pricing_type: PricingType
    price: Money = Field(ge=0, max_digits=10, decimal_places=2)
    unit_label: str | None = Field(default=None, max_length=40)
    max_quantity: int = Field(default=1, ge=1, le=20)
    duration_minutes: int = Field(default=60, ge=15, le=600)
    allowed_frequencies: list[ServiceFrequency] = Field(default_factory=lambda: [ServiceFrequency.ONE_TIME], min_length=1)
    available_states: list[str] | None = None
    is_active: bool = True
    display_order: int = 0
    addons: list[AddonIn] = Field(default_factory=list, max_length=10)

    @field_validator("image_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value and not value.startswith(("https://", "http://", "/")):
            raise ValueError("Image URL must start with https://, http:// or /.")
        return value or None

    @field_validator("allowed_frequencies")
    @classmethod
    def _unique(cls, value: list[ServiceFrequency]) -> list[ServiceFrequency]:
        return list(dict.fromkeys(value))

    @field_validator("available_states")
    @classmethod
    def _states(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        codes = sorted({v.strip().upper() for v in value if v.strip()})
        bad = [c for c in codes if c not in US_STATES]
        if bad:
            raise ValueError(f"Unknown state code(s): {', '.join(bad)}.")
        return codes


class ServiceOut(ORMModel):
    id: int
    category: CategoryBrief
    name: str
    slug: str
    description: str
    icon: str
    image_url: str | None
    pricing_type: PricingType
    price: Money
    unit_label: str | None
    max_quantity: int
    duration_minutes: int
    allowed_frequencies: list[ServiceFrequency]
    available_states: list[str] | None
    is_active: bool
    display_order: int
    requires_inspection: bool
    addons: list[AddonOut] = Field(default_factory=list)


# --- Quotes ---------------------------------------------------------------------


class QuoteItemIn(BaseModel):
    service_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=50)
    frequency: ServiceFrequency = ServiceFrequency.ONE_TIME
    addon_ids: list[int] = Field(default_factory=list, max_length=10)

    @field_validator("addon_ids")
    @classmethod
    def _unique_addons(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class QuoteIn(BaseModel):
    items: list[QuoteItemIn] = Field(min_length=1, max_length=25)
    discount_code: str | None = Field(default=None, max_length=40)
    # Two-letter state of the service address, to check regional availability.
    state: str | None = Field(default=None, min_length=2, max_length=2)


class QuoteAddonOut(BaseModel):
    id: int
    name: str
    price: Money


class QuoteLineOut(BaseModel):
    service_id: int
    service_name: str
    pricing_type: PricingType
    unit_price: Money
    unit_label: str | None
    addons: list[QuoteAddonOut]
    quantity: int
    frequency: ServiceFrequency
    line_total: Money
    duration_minutes: int
    is_estimate: bool


class QuoteProblem(BaseModel):
    service_id: int | None = None
    message: str


class QuoteOut(BaseModel):
    currency: str
    lines: list[QuoteLineOut]
    subtotal: Money
    discount_code: str | None
    discount_amount: Money
    tax_amount: Money
    fee_amount: Money
    total: Money
    total_is_estimate: bool
    total_duration_minutes: int
    # Anything that would block checkout (inactive service, bad option, bad code).
    problems: list[QuoteProblem]


# --- Discounts --------------------------------------------------------------------


class DiscountIn(BaseModel):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    discount_type: DiscountType
    value: Money = Field(gt=0, max_digits=10, decimal_places=2)
    min_subtotal: Money = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    max_uses: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None
    is_active: bool = True

    @field_validator("value")
    @classmethod
    def _percent(cls, value: Decimal, info) -> Decimal:
        if info.data.get("discount_type") is DiscountType.PERCENT and value > 100:
            raise ValueError("A percentage discount cannot exceed 100.")
        return value


class DiscountOut(ORMModel):
    id: int
    code: str
    discount_type: DiscountType
    value: Money
    min_subtotal: Money
    max_uses: int | None
    times_used: int
    expires_at: datetime | None
    is_active: bool
