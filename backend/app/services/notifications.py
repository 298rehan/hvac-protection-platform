"""The five notification emails the system sends.

Each function takes plain values (not ORM objects) so it can safely run in a
FastAPI BackgroundTask after the request's DB session has been closed.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from app.core.config import settings
from app.core.regions import state_name
from app.models.enums import BillingCycle
from app.services.email import send_template_email

logger = logging.getLogger("app.notifications")


def format_money(amount: Decimal | float | None) -> str:
    if amount is None:
        return "-"
    return f"${Decimal(amount):,.2f}"


def format_datetime(value: datetime | None) -> str:
    if value is None:
        return "-"
    return value.strftime("%b %d, %Y at %I:%M %p")


def format_date(value: datetime | None) -> str:
    if value is None:
        return "-"
    return value.strftime("%b %d, %Y")


def billing_label(cycle: BillingCycle | str) -> str:
    value = cycle.value if isinstance(cycle, BillingCycle) else str(cycle)
    return "Billed annually" if value == "ANNUAL" else "Billed monthly"


def price_label(amount: Decimal, cycle: BillingCycle | str) -> str:
    value = cycle.value if isinstance(cycle, BillingCycle) else str(cycle)
    suffix = "/year" if value == "ANNUAL" else "/month"
    return f"{format_money(amount)}{suffix}"


# --- Customer emails -------------------------------------------------------


def send_welcome_email(*, email: str, first_name: str, state_code: str, service_address: str) -> None:
    send_template_email(
        to_email=email,
        subject="Welcome to Summit Air Protection Plans",
        template_name="welcome.html",
        heading="Your account is ready",
        first_name=first_name,
        email=email,
        state_name=state_name(state_code),
        service_address=service_address,
    )


def send_purchase_submitted_email(
    *,
    email: str,
    first_name: str,
    order_number: str,
    plan_name: str,
    price: Decimal,
    billing_cycle: BillingCycle,
    state_code: str,
    submitted_at: datetime,
) -> None:
    send_template_email(
        to_email=email,
        subject=f"We received your enrollment - {plan_name}",
        template_name="purchase_submitted.html",
        heading="Enrollment received",
        first_name=first_name,
        order_number=order_number,
        plan_name=plan_name,
        price_label=price_label(price, billing_cycle),
        billing_cycle_label=billing_label(billing_cycle),
        state_name=state_name(state_code),
        submitted_at=format_datetime(submitted_at),
    )


def send_purchase_active_email(
    *,
    email: str,
    first_name: str,
    order_number: str,
    plan_name: str,
    price: Decimal,
    billing_cycle: BillingCycle,
    state_code: str,
    activated_at: datetime | None,
    expires_at: datetime | None,
) -> None:
    send_template_email(
        to_email=email,
        subject=f"Your {plan_name} coverage is active",
        template_name="purchase_active.html",
        heading="Your coverage is active",
        first_name=first_name,
        order_number=order_number,
        plan_name=plan_name,
        price_label=price_label(price, billing_cycle),
        billing_cycle_label=billing_label(billing_cycle),
        state_name=state_name(state_code),
        activated_at=format_datetime(activated_at),
        expires_at=format_date(expires_at),
    )


# --- Internal / admin emails ----------------------------------------------


def send_admin_new_customer_email(
    *,
    customer_id: int,
    full_name: str,
    email: str,
    phone: str | None,
    city: str | None,
    state_code: str,
    registered_at: datetime,
) -> None:
    send_template_email(
        to_email=settings.admin_notification_email,
        subject=f"New customer registered: {full_name}",
        template_name="admin_new_customer.html",
        heading="New customer registration",
        customer_id=str(customer_id),
        full_name=full_name,
        email=email,
        phone=phone or "-",
        location=f"{city or '-'}, {state_code}",
        state_name=state_name(state_code),
        registered_at=format_datetime(registered_at),
    )


def send_admin_new_purchase_email(
    *,
    order_number: str,
    customer_name: str,
    customer_email: str,
    plan_name: str,
    price: Decimal,
    billing_cycle: BillingCycle,
    state_code: str,
    submitted_at: datetime,
) -> None:
    send_template_email(
        to_email=settings.admin_notification_email,
        subject=f"New plan enrollment pending approval - {plan_name}",
        template_name="admin_new_purchase.html",
        heading="Enrollment pending approval",
        order_number=order_number,
        customer_name=customer_name,
        customer_email=customer_email,
        plan_name=plan_name,
        price_label=price_label(price, billing_cycle),
        billing_cycle_label=billing_label(billing_cycle),
        state_name=state_name(state_code),
        submitted_at=format_datetime(submitted_at),
    )
