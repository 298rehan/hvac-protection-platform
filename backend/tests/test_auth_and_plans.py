"""Existing auth flows keep working; the staff portal accepts admins and technicians."""

from app.models import UserRole
from tests.conftest import headers, make_plan, make_user

PASSWORD = "Password123!"


def _login(client, path, email):
    return client.post(path, json={"email": email, "password": PASSWORD})


def test_customer_login_unchanged(client, db):
    make_user(db, UserRole.CUSTOMER, "c@example.com")
    response = _login(client, "/api/auth/login", "c@example.com")
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "CUSTOMER"


def test_admin_login_unchanged_and_still_rejects_technicians(client, db):
    make_user(db, UserRole.ADMIN, "a@example.com")
    make_user(db, UserRole.TECHNICIAN, "t@example.com")
    assert _login(client, "/api/auth/admin/login", "a@example.com").status_code == 200
    assert _login(client, "/api/auth/admin/login", "t@example.com").status_code == 403


def test_staff_login_accepts_admin_and_technician_only(client, db):
    make_user(db, UserRole.ADMIN, "a@example.com")
    make_user(db, UserRole.TECHNICIAN, "t@example.com")
    make_user(db, UserRole.CUSTOMER, "c@example.com")
    assert _login(client, "/api/auth/staff/login", "a@example.com").json()["user"]["role"] == "ADMIN"
    assert (
        _login(client, "/api/auth/staff/login", "t@example.com").json()["user"]["role"]
        == "TECHNICIAN"
    )
    assert _login(client, "/api/auth/staff/login", "c@example.com").status_code == 403


def test_technician_cannot_use_customer_login(client, db):
    make_user(db, UserRole.TECHNICIAN, "t@example.com")
    assert _login(client, "/api/auth/login", "t@example.com").status_code == 403


def test_deactivated_technician_cannot_sign_in(client, db):
    make_user(db, UserRole.TECHNICIAN, "t@example.com", active=False)
    assert _login(client, "/api/auth/staff/login", "t@example.com").status_code == 403


def test_admin_manages_max_ac_units_on_plans(client, db):
    admin = make_user(db, UserRole.ADMIN, "a@example.com")
    plan = make_plan(db)
    response = client.put(
        f"/api/plans/{plan.id}", json={"max_ac_units": 3}, headers=headers(admin)
    )
    assert response.status_code == 200
    assert response.json()["max_ac_units"] == 3
    assert (
        client.put(f"/api/plans/{plan.id}", json={"max_ac_units": 0}, headers=headers(admin))
        .status_code
        == 422
    )


def test_technician_accounts_are_admin_managed(client, db):
    admin = make_user(db, UserRole.ADMIN, "a@example.com")
    customer = make_user(db, UserRole.CUSTOMER, "c@example.com")
    body = {
        "first_name": "Terry",
        "last_name": "Tech",
        "email": "terry@example.com",
        "password": "Sup3rSecret!",
    }
    assert client.post("/api/technicians", json=body, headers=headers(customer)).status_code == 403
    created = client.post("/api/technicians", json=body, headers=headers(admin))
    assert created.status_code == 201
    assert "password" not in created.text and "password_hash" not in created.text
    assert client.post("/api/technicians", json=body, headers=headers(admin)).status_code == 409
    # Technicians never appear in the customer directory.
    listed = client.get("/api/customers", headers=headers(admin)).json()
    emails = [row["email"] for row in (listed["items"] if isinstance(listed, dict) else listed)]
    assert "terry@example.com" not in emails
