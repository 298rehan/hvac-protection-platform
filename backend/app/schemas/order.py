"""Custom plan, cart, checkout and order schemas."""

import re
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import (
    CustomPlanKind,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PreferredWindow,
    PricingType,
    ServiceFrequency,
)
from app.schemas.catalog import QuoteItemIn, QuoteOut
from app.schemas.common import ORMModel
from app.schemas.service_request import AppointmentOut, TechnicianBrief
from app.schemas.user import UserSummary, _normalise_state


# --- Custom plans and cart -----------------------------------------------------------


class PlanItemsIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    ac_unit_id: int | None = Field(default=None, gt=0)
    items: list[QuoteItemIn] = Field(default_factory=list, max_length=25)

    @field_validator("items")
    @classmethod
    def _no_duplicates(cls, value: list[QuoteItemIn]) -> list[QuoteItemIn]:
        ids = [i.service_id for i in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Each service can only appear once - change its quantity instead.")
        return value


class PlanItemOut(BaseModel):
    service_id: int
    quantity: int
    frequency: ServiceFrequency
    addon_ids: list[int]


class CustomPlanOut(BaseModel):
    id: int
    kind: CustomPlanKind
    name: str
    ac_unit_id: int | None
    created_at: datetime
    updated_at: datetime
    items: list[PlanItemOut]
    # Priced with today's catalog prices; empty items give no quote.
    quote: QuoteOut | None


# --- Checkout ---------------------------------------------------------------------------

_KEY = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class CheckoutIn(BaseModel):
    # Generated once per checkout attempt by the browser; retries reuse it.
    idempotency_key: str
    items: list[QuoteItemIn] = Field(min_length=1, max_length=25)
    custom_plan_id: int | None = Field(default=None, gt=0)
    from_cart: bool = False
    ac_unit_id: int | None = Field(default=None, gt=0)
    # Required when no AC unit is chosen (its address is used otherwise).
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=2)
    zip_code: str | None = Field(default=None, max_length=10)
    requested_date: date
    requested_window: PreferredWindow
    discount_code: str | None = Field(default=None, max_length=40)
    payment_method: PaymentMethod = PaymentMethod.PAY_ON_SERVICE
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("idempotency_key")
    @classmethod
    def _key(cls, value: str) -> str:
        if not _KEY.match(value):
            raise ValueError("Invalid checkout key.")
        return value

    @field_validator("state")
    @classmethod
    def _state(cls, value: str | None) -> str | None:
        return _normalise_state(value) if value else None

    @field_validator("items")
    @classmethod
    def _no_duplicates(cls, value: list[QuoteItemIn]) -> list[QuoteItemIn]:
        ids = [i.service_id for i in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Each service can only appear once - change its quantity instead.")
        return value

    @model_validator(mode="after")
    def _address(self):
        if self.ac_unit_id is None:
            missing = [f for f in ("address", "city", "state", "zip_code") if not (getattr(self, f) or "").strip()]
            if missing:
                raise ValueError("Choose an AC unit or enter the full service address.")
        return self


class RescheduleIn(BaseModel):
    requested_date: date
    requested_window: PreferredWindow


class FinalPriceIn(BaseModel):
    item_id: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)


class FinalPricesIn(BaseModel):
    prices: list[FinalPriceIn] = Field(min_length=1, max_length=25)


class AvailabilitySlot(BaseModel):
    date: date
    window: PreferredWindow
    available: bool


# --- Orders -----------------------------------------------------------------------------


class OrderItemOut(ORMModel):
    id: int
    service_id: int | None
    service_name: str
    pricing_type: PricingType
    unit_price: Decimal
    quantity: int
    frequency: ServiceFrequency
    addons: list[dict]
    line_total: Decimal
    duration_minutes: int
    is_estimate: bool


class OrderOut(BaseModel):
    id: int
    status: OrderStatus
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    currency: str
    total: Decimal
    total_is_estimate: bool
    requested_date: date
    requested_window: PreferredWindow
    city: str
    state: str
    created_at: datetime
    item_count: int
    service_names: list[str]
    timezone: str
    appointment: AppointmentOut | None = None
    technician: TechnicianBrief | None = None
    customer: UserSummary | None = None  # staff views only


class OrderDetailOut(OrderOut):
    address: str
    zip_code: str
    ac_unit_id: int | None
    custom_plan_id: int | None
    customer_notes: str | None
    subtotal: Decimal
    discount_code: str | None
    discount_amount: Decimal
    tax_amount: Decimal
    fee_amount: Decimal
    status_reason: str | None
    confirmed_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    paid_at: datetime | None
    total_duration_minutes: int
    items: list[OrderItemOut]
