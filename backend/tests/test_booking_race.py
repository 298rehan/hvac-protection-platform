"""Two admins book overlapping visits for one technician at the same instant.

Only meaningful on MySQL (row locks + REPEATABLE READ snapshots), so it runs
when TEST_DATABASE_URL points at MySQL - as in CI - and is skipped on SQLite.
"""

import threading
from datetime import date, time, timedelta

import pytest
from fastapi import HTTPException

from app.models import Appointment, AppointmentStatus, ServiceRequest, ServiceRequestStatus, TechnicianProfile, User, UserRole
from app.schemas.service_request import AppointmentIn
from app.services import scheduling_service
from app.services import service_request_service as svc
from tests.conftest import TEST_DATABASE_URL, SessionLocal, headers, make_user, register_unit

pytestmark = pytest.mark.skipif(
    not (TEST_DATABASE_URL or "").startswith("mysql"), reason="needs MySQL row locking"
)

TX = {"address": "1 Main", "city": "Houston", "state": "TX", "zip_code": "77002"}


def test_simultaneous_overlapping_bookings(client, db):
    from tests.conftest import make_plan, make_purchase

    admin = make_user(db, UserRole.ADMIN, "admin@example.com")
    tech = make_user(db, UserRole.TECHNICIAN, "tech@example.com", state="TX")
    db.add(TechnicianProfile(user_id=tech.id, service_states=["TX"], service_zip_prefixes=[], specialties=[]))
    db.commit()
    request_ids = []
    for i in range(2):
        customer = make_user(db, UserRole.CUSTOMER, f"c{i}@example.com", state="TX")
        make_purchase(db, customer, make_plan(db, name=f"Plan {i}"))
        unit = register_unit(client, customer, **TX)
        created = client.post(
            "/api/service-requests",
            json={"ac_unit_id": unit["id"], "service_type": "NOT_COOLING", "description": "Blowing warm air"},
            headers=headers(customer),
        )
        request_ids.append(created.json()["id"])
    with SessionLocal() as s:
        for rid in request_ids:
            s.get(ServiceRequest, rid).status = ServiceRequestStatus.APPROVED
        s.commit()

    # Plain ints: the ORM objects above belong to the test's session, and
    # touching them from two threads would share its single connection.
    admin_id, tech_id = admin.id, tech.id
    barrier = threading.Barrier(2)
    outcomes = []
    visit_day = date.today() + timedelta(days=7)

    def book(request_id, start):
        with SessionLocal() as session:
            actor = session.get(User, admin_id)
            barrier.wait()
            try:
                request = svc.get_for_viewer(session, request_id, actor, lock=True)
                scheduling_service.schedule(
                    session, request=request, admin=actor,
                    payload=AppointmentIn(technician_id=tech_id, date=visit_day, start_time=start, duration_minutes=120),
                )
                outcomes.append("booked")
            except HTTPException as exc:
                session.rollback()
                outcomes.append(exc.status_code)

    threads = [
        threading.Thread(target=book, args=(request_ids[0], time(10, 0))),
        threading.Thread(target=book, args=(request_ids[1], time(11, 0))),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(map(str, outcomes)) == ["409", "booked"]
    with SessionLocal() as s:
        confirmed = s.query(Appointment).filter_by(technician_id=tech_id, status=AppointmentStatus.CONFIRMED).count()
    assert confirmed == 1


def test_simultaneous_duplicate_checkout_creates_one_order(client, db):
    """Double-click / retry race: same idempotency key submitted twice at once."""
    import uuid
    from decimal import Decimal

    from app.models import HvacService, PricingType, ServiceCategory, ServiceOrder
    from app.schemas.order import CheckoutIn
    from app.services import order_service

    customer = make_user(db, UserRole.CUSTOMER, "buyer@example.com", state="TX")
    tech = make_user(db, UserRole.TECHNICIAN, "tech2@example.com", state="TX")
    db.add(TechnicianProfile(user_id=tech.id, service_states=["TX"], service_zip_prefixes=[], specialties=[]))
    category = ServiceCategory(name="Servicing", slug="servicing", description="", icon="wrench")
    db.add(category)
    db.flush()
    service = HvacService(slug="insp", name="Inspection", description="", category_id=category.id,
                          pricing_type=PricingType.FIXED, price=Decimal("40"), allowed_frequencies=["ONE_TIME"])
    db.add(service)
    db.commit()
    customer_id, service_id = customer.id, service.id

    payload = CheckoutIn(
        idempotency_key=str(uuid.uuid4()), items=[{"service_id": service_id}],
        address="1 Main", city="Houston", state="TX", zip_code="77002",
        requested_date=date.today() + timedelta(days=5), requested_window="MORNING",
    )
    barrier = threading.Barrier(2)
    results = []

    def submit():
        with SessionLocal() as session:
            buyer = session.get(User, customer_id)
            barrier.wait()
            order, created = order_service.checkout(session, customer=buyer, payload=payload)
            results.append((order.id, created))

    threads = [threading.Thread(target=submit) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len({order_id for order_id, _ in results}) == 1
    assert sorted(created for _, created in results) == [False, True]
    with SessionLocal() as s:
        assert s.query(ServiceOrder).count() == 1
