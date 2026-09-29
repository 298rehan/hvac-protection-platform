"""Seed the database with demo data.

    python seed.py            # only seeds when the database is empty
    python seed.py --reset    # wipes plans/purchases/users first, then seeds

Every credential below is a PUBLIC DEMO credential for local development.
Never reuse these passwords for anything real.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database.session import SessionLocal, engine
from app.models import (
    BillingCycle,
    Plan,
    PlanRegion,
    Purchase,
    PurchaseStatus,
    PurchaseStatusHistory,
    User,
    UserRole,
)
from app.services.plan_service import slugify

# --------------------------------------------------------------------------
# Demo credentials - also documented in the README.
# --------------------------------------------------------------------------
ADMIN_EMAIL = "admin@hvacdemo.com"
ADMIN_PASSWORD = "Admin123!"
CUSTOMER_PASSWORD = "Customer123!"

# --------------------------------------------------------------------------
# Plans. `prices` maps a state code to (monthly, annual).
# Fictional demo prices for a fictional company.
# --------------------------------------------------------------------------
PLANS = [
    {
        "name": "Basic HVAC Care",
        "description": (
            "Essential seasonal maintenance to keep your heating and cooling system "
            "running efficiently all year, with priority booking over non-members."
        ),
        "features": [
            "Annual HVAC inspection",
            "Basic maintenance tune-up",
            "Standard filter replacement",
            "Priority scheduling",
        ],
        "display_order": 1,
        "prices": {
            "FL": ("19.99", "199.99"),
            "TX": ("21.99", "219.99"),
            "AZ": ("22.99", "229.99"),
            "CA": ("24.99", "249.99"),
        },
    },
    {
        "name": "Premium HVAC Protection",
        "description": (
            "Everything in Basic plus twice-yearly service visits and a full system "
            "diagnostic, so small problems are caught before they become repairs."
        ),
        "features": [
            "Everything in Basic HVAC Care",
            "Two maintenance visits per year",
            "Full HVAC system diagnostics",
            "Priority service dispatch",
            "15% discount on parts and labor",
        ],
        "display_order": 2,
        "prices": {
            "FL": ("34.99", "349.99"),
            "TX": ("36.99", "369.99"),
            "AZ": ("38.99", "389.99"),
            "CA": ("39.99", "399.99"),
        },
    },
    {
        "name": "Complete HVAC Protection",
        "description": (
            "Our most comprehensive coverage: everything in Premium plus emergency "
            "service coverage and additional protection for major system components."
        ),
        "features": [
            "Everything in Premium HVAC Protection",
            "24/7 emergency service coverage",
            "Major component protection",
            "Highest priority service",
            "No overtime or after-hours charges",
            "Annual duct and airflow assessment",
        ],
        "display_order": 3,
        "prices": {
            "FL": ("49.99", "499.99"),
            "TX": ("52.99", "529.99"),
            "AZ": ("55.99", "559.99"),
            "CA": ("59.99", "599.99"),
        },
    },
]

CUSTOMERS = [
    {
        "first_name": "Maria",
        "last_name": "Alvarez",
        "email": "maria.alvarez@example.com",
        "phone": "(305) 555-0142",
        "address": "1420 Palm Grove Avenue",
        "city": "Miami",
        "state": "FL",
        "zip_code": "33132",
    },
    {
        "first_name": "James",
        "last_name": "Holloway",
        "email": "james.holloway@example.com",
        "phone": "(512) 555-0188",
        "address": "877 Cedar Ridge Road",
        "city": "Austin",
        "state": "TX",
        "zip_code": "78704",
    },
    {
        "first_name": "Priya",
        "last_name": "Raman",
        "email": "priya.raman@example.com",
        "phone": "(602) 555-0119",
        "address": "3305 East Camelback Road",
        "city": "Phoenix",
        "state": "AZ",
        "zip_code": "85018",
    },
]


def wipe(db: Session) -> None:
    """Delete all demo data. Child rows go first to respect foreign keys."""
    db.execute(delete(PurchaseStatusHistory))
    db.execute(delete(Purchase))
    db.execute(delete(PlanRegion))
    db.execute(delete(Plan))
    db.execute(delete(User))
    db.commit()
    print("  Cleared existing users, plans and purchases.")


def seed_users(db: Session) -> tuple[User, list[User]]:
    admin = User(
        first_name="Dana",
        last_name="Whitfield",
        email=ADMIN_EMAIL,
        password_hash=hash_password(ADMIN_PASSWORD),
        role=UserRole.ADMIN,
        phone="(407) 555-0100",
        address="200 Service Center Drive",
        city="Orlando",
        state="FL",
        zip_code="32801",
    )
    db.add(admin)

    customers = []
    for spec in CUSTOMERS:
        customer = User(
            **spec,
            password_hash=hash_password(CUSTOMER_PASSWORD),
            role=UserRole.CUSTOMER,
        )
        db.add(customer)
        customers.append(customer)

    db.commit()
    for user in (admin, *customers):
        db.refresh(user)
    print(f"  Created 1 admin and {len(customers)} customers.")
    return admin, customers


def seed_plans(db: Session) -> list[Plan]:
    plans = []
    for spec in PLANS:
        base_monthly, base_annual = spec["prices"]["FL"]
        plan = Plan(
            name=spec["name"],
            slug=slugify(spec["name"]),
            description=spec["description"],
            features=spec["features"],
            base_monthly_price=Decimal(base_monthly),
            base_annual_price=Decimal(base_annual),
            display_order=spec["display_order"],
            is_active=True,
        )
        for state_code, (monthly, annual) in spec["prices"].items():
            plan.regions.append(
                PlanRegion(
                    state_code=state_code,
                    monthly_price=Decimal(monthly),
                    annual_price=Decimal(annual),
                    is_available=True,
                )
            )
        db.add(plan)
        plans.append(plan)

    db.commit()
    for plan in plans:
        db.refresh(plan)
    region_count = sum(len(p.regions) for p in plans)
    print(
        f"  Created {len(plans)} plans with {region_count} regional price rows.")
    return plans


def _make_purchase(
    db: Session,
    *,
    customer: User,
    plan: Plan,
    status: PurchaseStatus,
    cycle: BillingCycle,
    created_days_ago: int,
    admin: User,
) -> Purchase:
    """Build one purchase plus the status-history rows it would have accumulated."""
    region = plan.region_for(customer.state)
    price = (
        region.annual_price if cycle is BillingCycle.ANNUAL else region.monthly_price
    ) or plan.base_monthly_price

    created = datetime.now(timezone.utc) - timedelta(days=created_days_ago)
    purchase = Purchase(
        user_id=customer.id,
        plan_id=plan.id,
        status=status,
        billing_cycle=cycle,
        state_code=customer.state,
        price=price,
        created_at=created,
    )
    purchase.status_history.append(
        PurchaseStatusHistory(
            from_status=None,
            to_status=PurchaseStatus.PENDING,
            changed_by_user_id=customer.id,
            note="Enrollment submitted through the demo checkout.",
            created_at=created,
        )
    )

    term = timedelta(days=365 if cycle is BillingCycle.ANNUAL else 30)

    if status in (PurchaseStatus.ACTIVE, PurchaseStatus.EXPIRED):
        activated = created + timedelta(days=1)
        purchase.activated_at = activated
        purchase.expires_at = activated + term
        purchase.status_history.append(
            PurchaseStatusHistory(
                from_status=PurchaseStatus.PENDING,
                to_status=PurchaseStatus.ACTIVE,
                changed_by_user_id=admin.id,
                note="Approved by an administrator.",
                created_at=activated,
            )
        )

    if status is PurchaseStatus.EXPIRED:
        purchase.status_history.append(
            PurchaseStatusHistory(
                from_status=PurchaseStatus.ACTIVE,
                to_status=PurchaseStatus.EXPIRED,
                changed_by_user_id=admin.id,
                note="Coverage term ended.",
                created_at=purchase.expires_at,
            )
        )
    elif status is PurchaseStatus.CANCELLED:
        cancelled = created + timedelta(days=2)
        purchase.cancelled_at = cancelled
        purchase.status_history.append(
            PurchaseStatusHistory(
                from_status=PurchaseStatus.PENDING,
                to_status=PurchaseStatus.CANCELLED,
                changed_by_user_id=admin.id,
                note="Cancelled at the request of the customer.",
                created_at=cancelled,
            )
        )

    db.add(purchase)
    return purchase


def seed_purchases(db: Session, admin: User, customers: list[User], plans: list[Plan]) -> None:
    maria, james, priya = customers
    basic, premium, complete = plans

    # One purchase in each status so both dashboards have something to show.
    _make_purchase(db, customer=maria, plan=basic, status=PurchaseStatus.EXPIRED,
                   cycle=BillingCycle.MONTHLY, created_days_ago=420, admin=admin)
    _make_purchase(db, customer=maria, plan=complete, status=PurchaseStatus.ACTIVE,
                   cycle=BillingCycle.MONTHLY, created_days_ago=21, admin=admin)
    _make_purchase(db, customer=james, plan=premium, status=PurchaseStatus.PENDING,
                   cycle=BillingCycle.ANNUAL, created_days_ago=2, admin=admin)
    _make_purchase(db, customer=priya, plan=basic, status=PurchaseStatus.CANCELLED,
                   cycle=BillingCycle.MONTHLY, created_days_ago=9, admin=admin)

    db.commit()
    print("  Created 4 purchases (EXPIRED, ACTIVE, PENDING, CANCELLED).")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed the HVAC demo database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all existing user, plans and purchases before seeding.",
    )
    args = parser.parse_args()

    print(f"Connecting to {engine.url.render_as_string(hide_password=True)}")

    with SessionLocal() as db:
        existing_users = db.scalar(select(func.count()).select_from(User)) or 0

        if existing_users and not args.reset:
            print(
                f"\nDatabase already contains {existing_users} user(s). Nothing was changed."
                "\nRe-run with --reset to wipe and reseed."
            )
            return 0

        if existing_users:
            wipe(db)

        print("\nSeeding demo data...")
        admin, customers = seed_users(db)
        plans = seed_plans(db)
        seed_purchases(db, admin, customers, plans)

    lines = [f"  Admin     {ADMIN_EMAIL} / {ADMIN_PASSWORD}"]
    lines += [f"  Customer  {c['email']} / {CUSTOMER_PASSWORD}" for c in CUSTOMERS]
    print("\nDone. Demo credentials (local development only):")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
