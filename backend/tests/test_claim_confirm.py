"""Simplified claim form, one-step admin confirmation and technician working hours."""

from datetime import date, timedelta

import pytest

from app.models import Appointment, UserRole
from tests.conftest import SessionLocal, headers, make_plan, make_purchase, make_user, register_unit

TX = {"address": "500 Main St", "city": "Houston", "state": "TX", "zip_code": "77002"}


def next_weekday(weekday: int, after_days: int = 2) -> str:
    """Next date (at least `after_days` ahead) falling on weekday (Mon=0)."""
    day = date.today() + timedelta(days=after_days)
    while day.weekday() != weekday:
        day += timedelta(days=1)
    return day.isoformat()


MONDAY, SATURDAY = next_weekday(0), next_weekday(5)


@pytest.fixture
def setup(client, db):
    admin = make_user(db, UserRole.ADMIN, "boss@example.com")
    tech = make_user(db, UserRole.TECHNICIAN, "tess@example.com", state="TX")
    other_tech = make_user(db, UserRole.TECHNICIAN, "tom@example.com", state="TX")
    customer = make_user(db, UserRole.CUSTOMER, "cara@example.com", state="TX")
    make_purchase(db, customer, make_plan(db, max_ac_units=2))
    for t in (tech, other_tech):
        r = client.put(f"/api/technicians/{t.id}/profile", headers=headers(admin), json={
            "service_states": ["TX"], "work_days": [0, 1, 2, 3, 4], "work_start": "08:00", "work_end": "17:00"})
        assert r.status_code == 200, r.text
    return {"admin": admin, "tech": tech, "other_tech": other_tech, "customer": customer}


def open_claim(client, customer, *, windows=None, **overrides):
    body = {**TX, "service_type": "NOT_COOLING", **overrides}
    if windows is not None:
        body["preferred_windows"] = windows
    return client.post("/api/service-requests", json=body, headers=headers(customer))


def confirm(client, admin, claim_id, tech, day, start, minutes=120):
    return client.post(f"/api/service-requests/{claim_id}/confirm", headers=headers(admin),
                       json={"technician_id": tech.id, "date": day, "start_time": start, "duration_minutes": minutes})


# --- Simplified customer form ---------------------------------------------------------


def test_claim_with_address_only(client, setup):
    r = open_claim(client, setup["customer"], windows=[{"date": MONDAY, "window": "MORNING"}])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "SUBMITTED"
    assert body["ac_unit"]["address"] == "500 Main St" and body["ac_unit"]["state"] == "TX"
    assert body["description"] == ""  # optional
    assert body["preferred_windows"] == [{"date": MONDAY, "window": "MORNING"}]
    assert body["plan_name"] == "Premium"


def test_same_address_reuses_saved_location(client, setup):
    first = open_claim(client, setup["customer"]).json()
    client.post(f"/api/service-requests/{first['id']}/cancel", headers=headers(setup["customer"]), json={})
    second = open_claim(client, setup["customer"], address=" 500 main st ").json()
    assert second["ac_unit"]["id"] == first["ac_unit"]["id"]


def test_new_address_respects_plan_unit_limit(client, setup):
    customer = setup["customer"]
    register_unit(client, customer)  # unit 1 (Miami address)
    assert open_claim(client, customer).status_code == 201  # unit 2 auto-added (limit 2)
    r = open_claim(client, customer, address="9 Other Rd", zip_code="77003")
    assert r.status_code == 409 and "covers up to 2" in r.json()["detail"]


def test_other_issue_needs_description_and_address_required(client, setup):
    customer = setup["customer"]
    assert open_claim(client, customer, service_type="OTHER").status_code == 422
    assert open_claim(client, customer, service_type="OTHER", description="Thermostat screen is blank.").status_code == 201
    assert client.post("/api/service-requests", headers=headers(customer),
                       json={"service_type": "NOT_COOLING"}).status_code == 422


def test_saved_location_still_works(client, setup):
    customer = setup["customer"]
    unit = register_unit(client, customer, **TX)
    r = client.post("/api/service-requests", headers=headers(customer),
                    json={"ac_unit_id": unit["id"], "service_type": "WATER_LEAK"})
    assert r.status_code == 201 and r.json()["ac_unit"]["id"] == unit["id"]


def test_claims_need_active_plan(client, db):
    customer = make_user(db, UserRole.CUSTOMER, "nop@example.com", state="TX")
    assert open_claim(client, customer).status_code == 409


# --- One-step confirmation ------------------------------------------------------------


def test_confirm_from_submitted_in_one_step(client, setup):
    claim = open_claim(client, setup["customer"], windows=[{"date": MONDAY, "window": "MORNING"}]).json()
    r = confirm(client, setup["admin"], claim["id"], setup["tech"], MONDAY, "09:00")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SCHEDULED"
    assert r.json()["technician"]["id"] == setup["tech"].id
    events = [e["event_type"] for e in client.get(f"/api/service-requests/{claim['id']}/history",
                                                   headers=headers(setup["admin"])).json()]
    assert events == ["REQUEST_SUBMITTED", "REVIEW_STARTED", "REQUEST_APPROVED", "TECHNICIAN_ASSIGNED", "APPOINTMENT_CONFIRMED"]


@pytest.mark.parametrize("day, start, minutes", [
    (SATURDAY, "10:00", 60),   # not a working day
    (MONDAY, "07:00", 60),     # before 08:00
    (MONDAY, "16:00", 120),    # would end at 18:00, after 17:00
])
def test_confirm_outside_working_hours_changes_nothing(client, setup, day, start, minutes):
    claim = open_claim(client, setup["customer"]).json()
    r = confirm(client, setup["admin"], claim["id"], setup["tech"], day, start, minutes)
    assert r.status_code == 409 and "working hours" in r.json()["detail"]
    after = client.get(f"/api/service-requests/{claim['id']}", headers=headers(setup["admin"])).json()
    assert after["status"] == "SUBMITTED" and after["technician"] is None and after["appointment"] is None
    with SessionLocal() as s:
        assert s.query(Appointment).count() == 0


def test_confirm_overlap_changes_nothing(client, setup, db):
    admin, tech = setup["admin"], setup["tech"]
    first = open_claim(client, setup["customer"]).json()
    assert confirm(client, admin, first["id"], tech, MONDAY, "09:00").status_code == 200
    second_customer = make_user(db, UserRole.CUSTOMER, "dan@example.com", state="TX")
    make_purchase(db, second_customer, make_plan(db, name="Basic"))
    second = open_claim(client, second_customer, address="9 Elm St").json()
    r = confirm(client, admin, second["id"], tech, MONDAY, "10:00")
    assert r.status_code == 409 and "already has a visit" in r.json()["detail"]
    assert client.get(f"/api/service-requests/{second['id']}", headers=headers(admin)).json()["status"] == "SUBMITTED"
    # The other technician is free at the same time.
    assert confirm(client, admin, second["id"], setup["other_tech"], MONDAY, "10:00").json()["status"] == "SCHEDULED"


def test_confirm_permissions_and_states(client, setup):
    claim = open_claim(client, setup["customer"]).json()
    for user in (setup["customer"], setup["tech"]):
        assert confirm(client, user, claim["id"], setup["tech"], MONDAY, "09:00").status_code == 403
    admin = headers(setup["admin"])
    client.post(f"/api/service-requests/{claim['id']}/review", headers=admin, json={})
    client.post(f"/api/service-requests/{claim['id']}/request-info", headers=admin, json={"reason": "Need a photo"})
    r = confirm(client, setup["admin"], claim["id"], setup["tech"], MONDAY, "09:00")
    assert r.status_code == 409  # waiting for the customer's information


# --- Suggestions for the admin --------------------------------------------------------


def eligible(client, admin, claim_id):
    r = client.get(f"/api/service-requests/{claim_id}/eligible-technicians", headers=headers(admin))
    assert r.status_code == 200, r.text
    return {t["id"]: t for t in r.json()}


def test_preferred_slot_is_preselected_inside_working_hours(client, setup):
    claim = open_claim(client, setup["customer"], windows=[{"date": MONDAY, "window": "MORNING"}]).json()
    tech = eligible(client, setup["admin"], claim["id"])[setup["tech"].id]
    slot = tech["preferred_slot"]
    assert slot is not None
    assert slot["start_at"].startswith(MONDAY)  # Houston 08:00 CDT/CST is 13:00/14:00 UTC, same date
    assert tech["work_start"] == "08:00:00" and tech["work_days"] == [0, 1, 2, 3, 4]
    assert len(tech["suggested_slots"]) >= 1


def test_unavailable_preference_offers_alternatives(client, setup, db):
    admin = setup["admin"]
    # Saturday is outside both technicians' working days.
    claim = open_claim(client, setup["customer"], windows=[{"date": SATURDAY, "window": "MORNING"}]).json()
    techs = eligible(client, admin, claim["id"])
    for t in techs.values():
        assert t["preferred_slot"] is None and t["free_preferred_windows"] == []
        assert t["suggested_slots"], "alternatives must be offered"


def test_busy_technician_gets_no_preferred_slot(client, setup, db):
    admin, tech = setup["admin"], setup["tech"]
    blocker = open_claim(client, setup["customer"]).json()
    confirm(client, admin, blocker["id"], tech, MONDAY, "08:00", minutes=240)  # whole morning
    other = make_user(db, UserRole.CUSTOMER, "eve@example.com", state="TX")
    make_purchase(db, other, make_plan(db, name="Other"))
    claim = open_claim(client, other, address="7 Pine St", windows=[{"date": MONDAY, "window": "MORNING"}]).json()
    techs = eligible(client, admin, claim["id"])
    assert techs[tech.id]["preferred_slot"] is None
    assert techs[setup["other_tech"].id]["preferred_slot"] is not None
    assert list(techs)[0] == setup["other_tech"].id  # free technician ranked first


def test_working_hours_validation(client, setup):
    admin = headers(setup["admin"])
    url = f"/api/technicians/{setup['tech'].id}/profile"
    assert client.put(url, headers=admin, json={"service_states": ["TX"], "work_start": "17:00", "work_end": "09:00"}).status_code == 422
    assert client.put(url, headers=admin, json={"service_states": ["TX"], "work_days": [7]}).status_code == 422
    r = client.put(url, headers=admin, json={"service_states": ["TX"], "work_days": [5, 6, 5], "work_start": "09:30", "work_end": "13:00"})
    assert r.json()["work_days"] == [5, 6] and r.json()["work_start"] == "09:30:00"


def test_order_booking_respects_working_hours(client, setup, db):
    """The marketplace uses the same rule (shared technician calendar)."""
    from decimal import Decimal
    import uuid

    from app.models import HvacService, PricingType, ServiceCategory

    cat = ServiceCategory(name="S", slug="s", description="", icon="wrench")
    db.add(cat)
    db.flush()
    db.add(HvacService(slug="insp", name="Inspection", description="", category_id=cat.id,
                       pricing_type=PricingType.FIXED, price=Decimal("40"), allowed_frequencies=["ONE_TIME"]))
    db.commit()
    service_id = client.get("/api/catalog/services").json()[0]["id"]
    body = {"idempotency_key": str(uuid.uuid4()), "items": [{"service_id": service_id}], **TX,
            "requested_date": SATURDAY, "requested_window": "MORNING"}
    r = client.post("/api/orders", json=body, headers=headers(setup["customer"]))
    assert r.status_code == 409  # nobody works Saturdays
    slots = client.get("/api/catalog/availability?state=TX&zip_code=77002&days=10").json()
    assert not any(s["available"] for s in slots if s["date"] == SATURDAY)
    assert any(s["available"] for s in slots if s["date"] == MONDAY and s["window"] == "MORNING")
    # Evening (16-19) overlaps working hours 16:00-17:00, so a 1-hour visit still fits.
    assert any(s["available"] for s in slots if s["date"] == MONDAY and s["window"] == "EVENING")
