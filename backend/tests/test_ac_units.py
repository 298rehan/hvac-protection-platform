"""AC unit registration, plan limits and access control."""

from app.models import PurchaseStatus, UserRole
from tests.conftest import (
    AC_UNIT_PAYLOAD,
    headers,
    make_plan,
    make_purchase,
    make_user,
    register_unit,
)


def test_registration_requires_a_plan(client, db):
    customer = make_user(db, UserRole.CUSTOMER, "c@example.com")
    response = client.post("/api/ac-units", json=AC_UNIT_PAYLOAD, headers=headers(customer))
    assert response.status_code == 409


def test_registration_allowed_while_plan_pending(client, db):
    customer = make_user(db, UserRole.CUSTOMER, "c@example.com")
    make_purchase(db, customer, make_plan(db), PurchaseStatus.PENDING)
    unit = register_unit(client, customer)
    assert unit["state"] == "FL"  # normalised
    assert unit["plan_name"] == "Premium"


def test_plan_unit_limit_enforced(client, db):
    customer = make_user(db, UserRole.CUSTOMER, "c@example.com")
    make_purchase(db, customer, make_plan(db, max_ac_units=1))
    register_unit(client, customer)
    second = client.post("/api/ac-units", json=AC_UNIT_PAYLOAD, headers=headers(customer))
    assert second.status_code == 409
    assert "up to 1" in second.json()["detail"]


def test_only_customers_register_units(client, people):
    for role in ("admin", "tech"):
        response = client.post(
            "/api/ac-units", json=AC_UNIT_PAYLOAD, headers=headers(people[role])
        )
        assert response.status_code == 403


def test_future_installation_date_rejected(client, people):
    response = client.post(
        "/api/ac-units",
        json={**AC_UNIT_PAYLOAD, "installation_date": "2999-01-01"},
        headers=headers(people["customer"]),
    )
    assert response.status_code == 422


def test_other_customers_cannot_see_or_change_a_unit(client, people):
    unit = register_unit(client, people["customer"])
    intruder = headers(people["other"])
    assert client.get(f"/api/ac-units/{unit['id']}", headers=intruder).status_code == 404
    assert (
        client.patch(f"/api/ac-units/{unit['id']}", json={"brand": "X"}, headers=intruder).status_code
        == 404
    )
    assert client.delete(f"/api/ac-units/{unit['id']}", headers=intruder).status_code == 404
    mine = client.get("/api/ac-units/me", headers=intruder).json()
    assert all(u["id"] != unit["id"] for u in mine)


def test_unassigned_technician_cannot_see_unit_but_admin_can(client, people):
    unit = register_unit(client, people["customer"])
    assert client.get(f"/api/ac-units/{unit['id']}", headers=headers(people["tech"])).status_code == 404
    assert client.get(f"/api/ac-units/{unit['id']}", headers=headers(people["admin"])).status_code == 200
    listed = client.get(
        f"/api/ac-units?customer_id={people['customer'].id}", headers=headers(people["admin"])
    )
    assert [u["id"] for u in listed.json()] == [unit["id"]]
    assert (
        client.get(
            f"/api/ac-units?customer_id={people['customer'].id}", headers=headers(people["customer"])
        ).status_code
        == 403
    )


def test_owner_updates_and_deletes_unit(client, people):
    unit = register_unit(client, people["customer"])
    own = headers(people["customer"])
    updated = client.patch(
        f"/api/ac-units/{unit['id']}", json={"notes": "Rattles at night", "brand": None}, headers=own
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Rattles at night"
    assert updated.json()["brand"] == "Carrier"  # null ignored for required fields
    assert client.delete(f"/api/ac-units/{unit['id']}", headers=own).status_code == 204


def test_unit_with_service_history_cannot_be_deleted(client, people):
    unit = register_unit(client, people["customer"])
    own = headers(people["customer"])
    client.post(
        "/api/service-requests",
        json={"ac_unit_id": unit["id"], "service_type": "NOT_COOLING", "description": "Blowing warm air"},
        headers=own,
    )
    assert client.delete(f"/api/ac-units/{unit['id']}", headers=own).status_code == 409
