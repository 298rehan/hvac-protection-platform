"""Claims: coverage rules, more-info loop, location matching and appointment scheduling."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.models import Appointment, AppointmentStatus, Plan, UserRole
from tests.conftest import (
    SessionLocal,
    headers,
    make_plan,
    make_purchase,
    make_user,
    register_unit,
)

TX_UNIT = {"address": "500 Main St", "city": "Houston", "state": "TX", "zip_code": "77002"}
FL_UNIT = {"address": "1 Ocean Dr", "city": "Miami", "state": "FL", "zip_code": "33101"}


def day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


def submit(client, customer, unit_id, *, service_type="NOT_COOLING", windows=None):
    body = {"ac_unit_id": unit_id, "service_type": service_type, "description": "The system is blowing warm air."}
    if windows is not None:
        body["preferred_windows"] = windows
    return client.post("/api/service-requests", json=body, headers=headers(customer))


def act(client, user, request_id, action, body=None):
    return client.post(f"/api/service-requests/{request_id}/{action}", json=body or {}, headers=headers(user))


def set_area(client, admin, tech, states, zips=(), specialties=()):
    response = client.put(
        f"/api/technicians/{tech.id}/profile",
        json={"service_states": list(states), "service_zip_prefixes": list(zips), "specialties": list(specialties)},
        headers=headers(admin),
    )
    assert response.status_code == 200, response.text
    return response.json()


def customer_with_unit(client, db, email, unit_fields, *, plan=None, **unit_overrides):
    customer = make_user(db, UserRole.CUSTOMER, email, state=unit_fields["state"])
    make_purchase(db, customer, plan or make_plan(db, name=f"Plan {email}"))
    unit = register_unit(client, customer, **unit_fields, **unit_overrides)
    return customer, unit


def approved_claim(client, admin, customer, unit_id, windows=None):
    response = submit(client, customer, unit_id, windows=windows)
    assert response.status_code == 201, response.text
    request_id = response.json()["id"]
    assert act(client, admin, request_id, "review").status_code == 200
    assert act(client, admin, request_id, "approve").status_code == 200
    return request_id


def book(client, admin, request_id, tech, offset=5, start="10:00", minutes=120):
    return act(
        client, admin, request_id, "appointment",
        {"technician_id": tech.id, "date": day(offset), "start_time": start, "duration_minutes": minutes},
    )


@pytest.fixture
def staff(db):
    admin = make_user(db, UserRole.ADMIN, "boss@example.com")
    return {
        "admin": admin,
        "tx": make_user(db, UserRole.TECHNICIAN, "tex@example.com", state="TX"),
        "fl": make_user(db, UserRole.TECHNICIAN, "flo@example.com", state="FL"),
        "dallas": make_user(db, UserRole.TECHNICIAN, "dal@example.com", state="TX"),
        "idle": make_user(db, UserRole.TECHNICIAN, "idle@example.com", state="TX", active=False),
        "noprofile": make_user(db, UserRole.TECHNICIAN, "nop@example.com", state="TX"),
    }


@pytest.fixture
def areas(client, staff):
    admin = staff["admin"]
    set_area(client, admin, staff["tx"], ["TX"])
    set_area(client, admin, staff["fl"], ["FL"])
    set_area(client, admin, staff["dallas"], ["TX"], zips=["750", "752"])  # Dallas only
    set_area(client, admin, staff["idle"], ["TX"])
    return staff


# --- Eligibility and coverage -----------------------------------------------------


def test_coverage_rules_enforced(client, db):
    plan = make_plan(db, name="Heat pumps only")
    with SessionLocal() as s:
        p = s.get(Plan, plan.id)
        p.covered_ac_types = ["HEAT_PUMP"]
        p.covered_service_types = ["NOT_HEATING"]
        s.commit()
    customer, unit = customer_with_unit(client, db, "c@example.com", FL_UNIT, plan=plan)  # CENTRAL_SPLIT
    response = submit(client, customer, unit["id"])
    assert response.status_code == 409 and "equipment" in response.json()["detail"]

    # The plan allows one unit, so change the existing unit's type instead.
    client.patch(f"/api/ac-units/{unit['id']}", json={"ac_type": "HEAT_PUMP"}, headers=headers(customer))
    response = submit(client, customer, unit["id"], service_type="NOT_COOLING")
    assert response.status_code == 409 and "issue" in response.json()["detail"]
    assert submit(client, customer, unit["id"], service_type="NOT_HEATING").status_code == 201


def test_unrestricted_plan_accepts_new_categories(client, db):
    customer, unit = customer_with_unit(client, db, "c@example.com", FL_UNIT, ac_type="FURNACE")
    assert submit(client, customer, unit["id"], service_type="THERMOSTAT_ISSUE").status_code == 201


def test_admin_sets_and_clears_coverage(client, db, staff):
    plan = make_plan(db)
    admin = headers(staff["admin"])
    r = client.put(f"/api/plans/{plan.id}", json={"covered_ac_types": ["FURNACE", "HEAT_PUMP"]}, headers=admin)
    assert r.json()["covered_ac_types"] == ["FURNACE", "HEAT_PUMP"]
    r = client.put(f"/api/plans/{plan.id}", json={"covered_ac_types": None}, headers=admin)
    assert r.json()["covered_ac_types"] is None
    assert client.put(f"/api/plans/{plan.id}", json={"covered_ac_types": ["SPACESHIP"]}, headers=admin).status_code == 422


# --- Preferred windows -----------------------------------------------------------


def test_preferred_windows_validated_and_stored(client, db):
    customer, unit = customer_with_unit(client, db, "c@example.com", FL_UNIT)
    bad = [
        # -3 days is in the past in every US time zone, whatever this machine's zone is.
        [{"date": day(-3), "window": "MORNING"}],
        [{"date": day(90), "window": "MORNING"}],
    ]
    for windows in bad:
        assert submit(client, customer, unit["id"], windows=windows).status_code == 400
    dup = [{"date": day(2), "window": "MORNING"}] * 2
    assert submit(client, customer, unit["id"], windows=dup).status_code == 422
    too_many = [{"date": day(i), "window": "MORNING"} for i in range(1, 7)]
    assert submit(client, customer, unit["id"], windows=too_many).status_code == 422

    windows = [{"date": day(3), "window": "EVENING"}, {"date": day(2), "window": "AFTERNOON"}]
    response = submit(client, customer, unit["id"], windows=windows)
    assert response.status_code == 201
    stored = response.json()["preferred_windows"]
    assert stored == [{"date": day(2), "window": "AFTERNOON"}, {"date": day(3), "window": "EVENING"}]
    assert response.json()["timezone"] == "America/New_York"
    assert response.json()["appointment"] is None  # preferences are not appointments


# --- More information loop -----------------------------------------------------------


def test_more_information_loop(client, db, staff, people):
    unit = register_unit(client, people["customer"])
    request_id = submit(client, people["customer"], unit["id"]).json()["id"]
    admin, customer = staff["admin"], people["customer"]

    assert act(client, admin, request_id, "request-info", {"reason": "Need a photo"}).status_code == 409  # not reviewing yet
    act(client, admin, request_id, "review")
    assert act(client, admin, request_id, "request-info", {}).status_code == 422
    r = act(client, admin, request_id, "request-info", {"reason": "Please add a photo of the outdoor unit."})
    assert r.json()["status"] == "NEEDS_INFO"
    assert r.json()["info_request_note"].startswith("Please add a photo")

    assert act(client, people["other"], request_id, "provide-info", {"note": "x" * 5}).status_code == 404
    assert act(client, staff["tx"], request_id, "provide-info", {"note": "x" * 5}).status_code == 403
    assert act(client, admin, request_id, "approve").status_code == 409  # waiting on the customer

    r = act(client, customer, request_id, "provide-info", {"note": "Photo uploaded, it rattles at night."})
    assert r.json()["status"] == "UNDER_REVIEW"
    assert r.json()["info_response_note"].startswith("Photo uploaded")
    assert act(client, customer, request_id, "provide-info", {"note": "again"}).status_code == 409


# --- Location matching ----------------------------------------------------------------


def eligible(client, admin, request_id):
    response = client.get(f"/api/service-requests/{request_id}/eligible-technicians", headers=headers(admin))
    assert response.status_code == 200, response.text
    return response.json()


def test_texas_claim_only_matches_texas_area(client, db, areas):
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, areas["admin"], customer, unit["id"])
    techs = eligible(client, areas["admin"], request_id)
    # Houston 77002: the TX-wide tech matches; the Dallas-only (750/752), Florida,
    # deactivated and profile-less technicians do not.
    assert [t["id"] for t in techs] == [areas["tx"].id]
    assert techs[0]["area_match"] == "state"


def test_florida_claim_uses_same_rules(client, db, areas):
    customer, unit = customer_with_unit(client, db, "fl@example.com", FL_UNIT)
    request_id = approved_claim(client, areas["admin"], customer, unit["id"])
    assert [t["id"] for t in eligible(client, areas["admin"], request_id)] == [areas["fl"].id]


def test_zip_prefix_match(client, db, areas):
    dallas = {"address": "1 Elm St", "city": "Dallas", "state": "TX", "zip_code": "75201"}
    customer, unit = customer_with_unit(client, db, "dal-cust@example.com", dallas)
    request_id = approved_claim(client, areas["admin"], customer, unit["id"])
    techs = {t["id"]: t for t in eligible(client, areas["admin"], request_id)}
    assert set(techs) == {areas["tx"].id, areas["dallas"].id}
    assert techs[areas["dallas"].id]["area_match"] == "zip"


def test_ranking_prefers_specialty_then_lower_workload(client, db, areas):
    set_area(client, areas["admin"], areas["dallas"], ["TX"], specialties=["CENTRAL_SPLIT"])
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)  # CENTRAL_SPLIT
    request_id = approved_claim(client, areas["admin"], customer, unit["id"])
    techs = eligible(client, areas["admin"], request_id)
    assert techs[0]["id"] == areas["dallas"].id and techs[0]["specialty_match"] is True
    assert techs[1]["id"] == areas["tx"].id and techs[1]["specialty_match"] is False


def test_free_preferred_windows_reflect_bookings(client, db, areas):
    admin = areas["admin"]
    windows = [{"date": day(5), "window": "MORNING"}, {"date": day(6), "window": "MORNING"}]
    c1, u1 = customer_with_unit(client, db, "a@example.com", TX_UNIT)
    c2, u2 = customer_with_unit(client, db, "b@example.com", TX_UNIT)
    first = approved_claim(client, admin, c1, u1["id"])
    second = approved_claim(client, admin, c2, u2["id"], windows=windows)
    assert book(client, admin, first, areas["tx"], offset=5, start="09:00").status_code == 200
    tech = next(t for t in eligible(client, admin, second) if t["id"] == areas["tx"].id)
    assert tech["free_preferred_windows"] == [{"date": day(6), "window": "MORNING"}]
    assert len(tech["upcoming_appointments"]) == 1
    assert tech["open_jobs"] == 1


# --- Scheduling ------------------------------------------------------------------------


def test_schedule_confirms_visit_in_property_time(client, db, areas):
    admin = areas["admin"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    r = book(client, admin, request_id, areas["tx"], offset=5, start="10:00", minutes=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "SCHEDULED"
    assert body["technician"]["id"] == areas["tx"].id
    appt = body["appointment"]
    expected = datetime.combine(date.fromisoformat(day(5)), datetime.min.time().replace(hour=10),
                                tzinfo=ZoneInfo("America/Chicago")).astimezone(timezone.utc)
    assert datetime.fromisoformat(appt["start_at"]) == expected
    assert datetime.fromisoformat(appt["end_at"]) == expected + timedelta(minutes=90)
    assert appt["timezone"] == "America/Chicago" and appt["status"] == "CONFIRMED"

    customer_view = client.get(f"/api/service-requests/{request_id}", headers=headers(customer)).json()
    assert customer_view["appointment"]["start_at"] == appt["start_at"]


def test_no_overlapping_appointments_for_a_technician(client, db, areas):
    admin = areas["admin"]
    c1, u1 = customer_with_unit(client, db, "a@example.com", TX_UNIT)
    c2, u2 = customer_with_unit(client, db, "b@example.com", TX_UNIT)
    first = approved_claim(client, admin, c1, u1["id"])
    second = approved_claim(client, admin, c2, u2["id"])
    assert book(client, admin, first, areas["tx"], start="10:00", minutes=120).status_code == 200

    clash = book(client, admin, second, areas["tx"], start="11:00", minutes=60)
    assert clash.status_code == 409 and "already has a visit" in clash.json()["detail"]
    detail = client.get(f"/api/service-requests/{second}", headers=headers(admin)).json()
    assert detail["status"] == "APPROVED" and detail["appointment"] is None  # nothing half-saved

    # Back-to-back is fine: 12:00 starts exactly when the first visit ends.
    assert book(client, admin, second, areas["tx"], start="12:00", minutes=60).status_code == 200


def test_cannot_book_technician_outside_area_or_in_past(client, db, areas):
    admin = areas["admin"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    assert book(client, admin, request_id, areas["fl"]).status_code == 409
    assert book(client, admin, request_id, areas["dallas"]).status_code == 409
    assert book(client, admin, request_id, areas["idle"]).status_code == 400
    assert book(client, admin, request_id, areas["tx"], offset=-1).status_code == 400


def test_cannot_schedule_before_approval(client, db, areas):
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = submit(client, customer, unit["id"]).json()["id"]
    assert book(client, areas["admin"], request_id, areas["tx"]).status_code == 409


def test_reschedule_replaces_appointment(client, db, areas):
    admin = areas["admin"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    book(client, admin, request_id, areas["tx"], offset=5)
    r = book(client, admin, request_id, areas["tx"], offset=6)
    assert r.json()["status"] == "SCHEDULED"
    with SessionLocal() as s:
        statuses = sorted(a.status.value for a in s.query(Appointment).filter_by(service_request_id=request_id))
    assert statuses == ["CANCELLED", "CONFIRMED"]


def test_reassigning_scheduled_claim_cancels_visit(client, db, areas):
    admin = areas["admin"]
    set_area(client, admin, areas["dallas"], ["TX"])  # now serves all of Texas
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    book(client, admin, request_id, areas["tx"])
    r = act(client, admin, request_id, "assign", {"technician_id": areas["dallas"].id})
    assert r.json()["status"] == "ASSIGNED"
    assert r.json()["appointment"] is None
    assert client.get(f"/api/service-requests/{request_id}", headers=headers(areas["tx"])).status_code == 404


def test_cancelling_claim_frees_the_slot(client, db, areas):
    admin = areas["admin"]
    c1, u1 = customer_with_unit(client, db, "a@example.com", TX_UNIT)
    c2, u2 = customer_with_unit(client, db, "b@example.com", TX_UNIT)
    first = approved_claim(client, admin, c1, u1["id"])
    second = approved_claim(client, admin, c2, u2["id"])
    book(client, admin, first, areas["tx"])
    assert act(client, admin, first, "cancel", {"note": "Customer fixed it"}).json()["status"] == "CANCELLED"
    assert book(client, admin, second, areas["tx"]).status_code == 200


def test_technician_works_scheduled_job(client, db, areas):
    admin, tech = areas["admin"], areas["tx"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    book(client, admin, request_id, tech)
    jobs = client.get("/api/service-requests/assigned", headers=headers(tech)).json()
    assert jobs[0]["appointment"]["status"] == "CONFIRMED"
    assert act(client, tech, request_id, "start-inspection").json()["status"] == "INSPECTION_IN_PROGRESS"


def test_confirmed_visit_emails_customer_and_technician(client, db, areas, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.notifications.send_template_email",
        lambda **kwargs: sent.append((kwargs["to_email"], kwargs["template_name"])) or True,
    )
    admin = areas["admin"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    book(client, admin, request_id, areas["tx"])
    assert ("tx@example.com", "appointment_confirmed.html") in sent
    assert ("tex@example.com", "appointment_confirmed.html") in sent


# --- Permissions ----------------------------------------------------------------------


def test_only_admins_match_schedule_and_manage_areas(client, db, areas, people):
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, areas["admin"], customer, unit["id"])
    for user in (customer, areas["tx"]):
        assert client.get(f"/api/service-requests/{request_id}/eligible-technicians", headers=headers(user)).status_code == 403
        assert book(client, user, request_id, areas["tx"]).status_code == 403
        assert act(client, user, request_id, "request-info", {"reason": "why?"}).status_code == 403
        assert client.put(
            f"/api/technicians/{areas['tx'].id}/profile",
            json={"service_states": ["CA"]},
            headers=headers(user),
        ).status_code == 403


def test_profile_validation(client, areas):
    admin = headers(areas["admin"])
    url = f"/api/technicians/{areas['tx'].id}/profile"
    assert client.put(url, json={"service_states": ["XX"]}, headers=admin).status_code == 422
    assert client.put(url, json={"service_states": ["TX"], "service_zip_prefixes": ["7a"]}, headers=admin).status_code == 422
    assert client.put(url, json={"service_states": ["TX"], "specialties": ["ROCKET"]}, headers=admin).status_code == 422
    r = client.put(url, json={"service_states": ["tx", "fl"], "service_zip_prefixes": ["770"]}, headers=admin)
    assert r.json()["service_states"] == ["FL", "TX"]


def test_appointment_rows_store_utc(client, db, areas):
    admin = areas["admin"]
    customer, unit = customer_with_unit(client, db, "tx@example.com", TX_UNIT)
    request_id = approved_claim(client, admin, customer, unit["id"])
    book(client, admin, request_id, areas["tx"])
    with SessionLocal() as s:
        appt = s.query(Appointment).filter_by(service_request_id=request_id).one()
        assert appt.start_at.tzinfo is not None and appt.start_at.utcoffset() == timedelta(0)
        assert appt.status is AppointmentStatus.CONFIRMED
