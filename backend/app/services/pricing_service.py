"""The one place prices are calculated.

Every number comes from the database: service and add-on prices, discount
codes and the configured tax rate / booking fee. Quotes, saved plans, the cart
and checkout all call `price_items`, so the frontends can never set a price.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import DiscountCode, DiscountType, HvacService, PricingType, ServiceAddon
from app.schemas.catalog import QuoteAddonOut, QuoteItemIn, QuoteLineOut, QuoteOut, QuoteProblem

CENT = Decimal("0.01")
ZERO = Decimal("0.00")

FREQUENCY_WORDS = {"ONE_TIME": "one-time", "MONTHLY": "monthly", "QUARTERLY": "quarterly", "YEARLY": "yearly"}


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class PricedLine:
    service: HvacService
    addons: list[ServiceAddon]
    quantity: int
    frequency: str
    unit_price: Decimal
    line_total: Decimal


@dataclass
class PricingResult:
    quote: QuoteOut
    lines: list[PricedLine] = field(default_factory=list)
    discount: DiscountCode | None = None

    @property
    def ok(self) -> bool:
        return not self.quote.problems


def find_discount(db: Session, code: str, *, lock: bool = False) -> DiscountCode | None:
    stmt = select(DiscountCode).where(func.upper(DiscountCode.code) == code.strip().upper())
    if lock:
        stmt = stmt.with_for_update()
    return db.execute(stmt).scalars().first()


def _discount_problem(discount: DiscountCode | None, subtotal: Decimal) -> str | None:
    if discount is None or not discount.is_active:
        return "That discount code is not valid."
    if discount.expires_at is not None and discount.expires_at <= datetime.now(timezone.utc):
        return "That discount code has expired."
    if discount.max_uses is not None and discount.times_used >= discount.max_uses:
        return "That discount code has already been fully used."
    if subtotal < discount.min_subtotal:
        return f"That discount code needs a subtotal of at least {money(discount.min_subtotal)}."
    return None


def price_items(
    db: Session,
    items: list[QuoteItemIn],
    *,
    discount_code: str | None = None,
    state: str | None = None,
    lock_discount: bool = False,
) -> PricingResult:
    problems: list[QuoteProblem] = []
    lines: list[PricedLine] = []

    ids = [item.service_id for item in items]
    services = {
        s.id: s
        for s in db.execute(select(HvacService).where(HvacService.id.in_(ids))).unique().scalars()
    } if ids else {}
    seen: set[int] = set()

    for item in items:
        service = services.get(item.service_id)
        if item.service_id in seen:
            problems.append(QuoteProblem(service_id=item.service_id, message="This service is listed twice."))
            continue
        seen.add(item.service_id)
        if service is None or not service.is_active or not service.category.is_active:
            problems.append(QuoteProblem(service_id=item.service_id, message="This service is no longer available."))
            continue
        if state and service.available_states is not None and state.upper() not in service.available_states:
            problems.append(QuoteProblem(service_id=service.id, message=f"{service.name} is not offered in {state.upper()}."))
            continue
        if item.frequency.value not in service.allowed_frequencies:
            word = FREQUENCY_WORDS[item.frequency.value]
            problems.append(QuoteProblem(service_id=service.id, message=f"{service.name} can't be booked as a {word} service."))
            continue
        if item.quantity > service.max_quantity:
            problems.append(
                QuoteProblem(service_id=service.id, message=f"{service.name} allows at most {service.max_quantity} per order.")
            )
            continue
        valid_addons = {a.id: a for a in service.addons if a.is_active}
        chosen = [valid_addons.get(addon_id) for addon_id in item.addon_ids]
        if None in chosen:
            problems.append(QuoteProblem(service_id=service.id, message=f"An option chosen for {service.name} is not available."))
            continue

        unit_price = money(service.price + sum((a.price for a in chosen), ZERO))
        lines.append(
            PricedLine(
                service=service,
                addons=chosen,
                quantity=item.quantity,
                frequency=item.frequency.value,
                unit_price=unit_price,
                line_total=money(unit_price * item.quantity),
            )
        )

    subtotal = money(sum((line.line_total for line in lines), ZERO))

    discount = None
    discount_amount = ZERO
    if discount_code and discount_code.strip():
        discount = find_discount(db, discount_code, lock=lock_discount)
        problem = _discount_problem(discount, subtotal)
        if problem:
            problems.append(QuoteProblem(message=problem))
            discount = None
        elif discount.discount_type is DiscountType.PERCENT:
            discount_amount = money(subtotal * discount.value / 100)
        else:
            discount_amount = money(min(discount.value, subtotal))

    taxable = subtotal - discount_amount
    tax_amount = money(taxable * settings.service_tax_rate) if settings.service_tax_rate > 0 else ZERO
    fee_amount = money(settings.service_booking_fee) if settings.service_booking_fee > 0 and lines else ZERO
    total = money(taxable + tax_amount + fee_amount)

    quote = QuoteOut(
        currency=settings.currency,
        lines=[
            QuoteLineOut(
                service_id=line.service.id,
                service_name=line.service.name,
                pricing_type=line.service.pricing_type,
                unit_price=line.unit_price,
                unit_label=line.service.unit_label,
                addons=[QuoteAddonOut(id=a.id, name=a.name, price=a.price) for a in line.addons],
                quantity=line.quantity,
                frequency=line.frequency,
                line_total=line.line_total,
                duration_minutes=line.service.duration_minutes * line.quantity,
                is_estimate=line.service.pricing_type is PricingType.STARTING_AT,
            )
            for line in lines
        ],
        subtotal=subtotal,
        discount_code=discount.code if discount else None,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        fee_amount=fee_amount,
        total=total,
        total_is_estimate=any(line.service.pricing_type is PricingType.STARTING_AT for line in lines),
        total_duration_minutes=sum(line.service.duration_minutes * line.quantity for line in lines),
        problems=problems,
    )
    return PricingResult(quote=quote, lines=lines, discount=discount)
