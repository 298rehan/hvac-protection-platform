"""Service request lifecycle, role checks and technician job access."""

import pytest

from app.models import PurchaseStatus, UserRole
from tests.conftest import (
    PNG_BYTES,
    headers,
    make_plan,
    make_purchase,
    make_user,
    register_unit,
    upload_photo,
)

PNG = {"filename": "after.png", "content_type": "image/png", "size_bytes": len(PNG_BYTES)}


def submit(client, customer, unit_id, service_type="NOT_COOLING"):
    return client.post(
        "/api/service-requests",
        json={"ac_unit_id": unit_id, "service_type": service_type, "description": "Unit blows warm air."},
        headers=headers(customer),
    )


def act(client, user, request_id, action, body=None):
    return client.post(f"/api/service-requests/{request_id}/{action}", json=body or {}, headers=headers(user))


@pytest.fixture
def request_id(client, people):
    unit = register_unit(client, people["customer"])
    response = submit(client, people["customer"], unit["id"])
    assert response.status_code == 201, response.text
    return response.json()["id"]


def assigned(client, people, request_id):
    admin = people["admin"]
    assert act(client, admin, request_id, "review").status_code == 200
    assert act(client, admin, request_id, "approve").status_code == 200
    response = act(client, admin, request_id, "assign", {"technician_id": people["tech"].id})
    assert response.status_code == 200, response.text
    return response.json()


# --- Creation ---------------------------------------------------------------------


def test_submission_requires_active_plan(client, db):
    customer = make_user(db, UserRole.CUSTOMER, "c@example.com")
    make_purchase(db, customer, make_plan(db), PurchaseStatus.PENDING)
    unit = register_unit(client, customer)
    response = submit(client, customer, unit["id"])
    assert response.status_code == 409
    assert "active" in response.json()["detail"]


def test_submission_creates_submitted_request(client, people, request_id):
    detail = client.get(f"/api/service-requests/{request_id}", headers=headers(people["customer"])).json()
    assert detail["status"] == "SUBMITTED"
    assert detail["plan"]["plan_name"] == "Premium"
    assert detail["allowed_upload_categories"] == ["CUSTOMER"]
    assert detail["technician_notes"] is None and detail["customer"] is None  # staff-only fields


def test_photo_recommended_for_leaks(client, people):
    unit = register_unit(client, people["customer"])
    detail = submit(client, people["customer"], unit["id"], "WATER_LEAK").json()
    assert detail["photo_recommended"] is True


def test_one_open_request_per_unit(client, people, request_id):
    unit_id = client.get(f"/api/service-requests/{request_id}", headers=headers(people["customer"])).json()["ac_unit"]["id"]
    assert submit(client, people["customer"], unit_id).status_code == 409


def test_cannot_submit_for_another_customers_unit(client, people):
    unit = register_unit(client, people["customer"])
    assert submit(client, people["other"], unit["id"]).status_code == 404


def test_other_customers_cannot_see_request(client, people, request_id):
    assert client.get(f"/api/service-requests/{request_id}", headers=headers(people["other"])).status_code == 404
    assert client.get(f"/api/service-requests/{request_id}/history", headers=headers(people["other"])).status_code == 404
    assert client.get("/api/service-requests/me", headers=headers(people["other"])).json() == []


# --- Admin actions ------------------------------------------------------------------


def test_only_admins_review_approve_reject_assign(client, people, request_id):
    for role in ("customer", "tech"):
        user = people[role]
        assert act(client, user, request_id, "review").status_code == 403
        assert act(client, user, request_id, "approve").status_code == 403
        assert act(client, user, request_id, "reject", {"reason": "nope"}).status_code == 403
        assert act(client, user, request_id, "assign", {"technician_id": people["tech"].id}).status_code == 403
    assert client.get("/api/service-requests", headers=headers(people["customer"])).status_code == 403


def test_reject_requires_reason_and_is_final(client, people, request_id):
    admin = people["admin"]
    act(client, admin, request_id, "review")
    assert act(client, admin, request_id, "reject", {}).status_code == 422
    rejected = act(client, admin, request_id, "reject", {"reason": "Not covered by plan"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "REJECTED"
    assert rejected.json()["status_reason"] == "Not covered by plan"
    assert act(client, admin, request_id, "approve").status_code == 409


def test_cannot_skip_review(client, people, request_id):
    assert act(client, people["admin"], request_id, "approve").status_code == 409
    response = act(client, people["admin"], request_id, "assign", {"technician_id": people["tech"].id})
    assert response.status_code == 409


def test_assign_validates_technician(client, people, db, request_id):
    admin = people["admin"]
    act(client, admin, request_id, "review")
    act(client, admin, request_id, "approve")
    assert act(client, admin, request_id, "assign", {"technician_id": people["customer"].id}).status_code == 400
    inactive = make_user(db, UserRole.TECHNICIAN, "idle@example.com", active=False)
    assert act(client, admin, request_id, "assign", {"technician_id": inactive.id}).status_code == 400


def test_reassign_before_work_starts(client, people, request_id):
    assigned(client, people, request_id)
    response = act(client, people["admin"], request_id, "assign", {"technician_id": people["tech2"].id})
    assert response.status_code == 200
    assert response.json()["technician"]["id"] == people["tech2"].id
    # The first technician loses access.
    assert client.get(f"/api/service-requests/{request_id}", headers=headers(people["tech"])).status_code == 404


def test_admin_list_filters(client, people, request_id):
    admin = headers(people["admin"])
    assert [r["id"] for r in client.get("/api/service-requests?status=SUBMITTED", headers=admin).json()] == [request_id]
    assert client.get("/api/service-requests?status=COMPLETED", headers=admin).json() == []
    assert [r["id"] for r in client.get("/api/service-requests?search=alice", headers=admin).json()] == [request_id]


# --- Technician workflow -----------------------------------------------------------


def test_technician_sees_only_assigned_jobs(client, people, request_id):
    assert client.get("/api/service-requests/assigned", headers=headers(people["tech"])).json() == []
    assert client.get(f"/api/service-requests/{request_id}", headers=headers(people["tech"])).status_code == 404
    assigned(client, people, request_id)
    jobs = client.get("/api/service-requests/assigned", headers=headers(people["tech"])).json()
    assert [j["id"] for j in jobs] == [request_id]
    assert client.get("/api/service-requests/assigned", headers=headers(people["tech2"])).json() == []
    assert client.get("/api/service-requests/assigned", headers=headers(people["customer"])).status_code == 403
    detail = client.get(f"/api/service-requests/{request_id}", headers=headers(people["tech"])).json()
    assert detail["customer_address"].startswith("1 Main St")


def test_other_technician_cannot_act_on_job(client, people, request_id):
    assigned(client, people, request_id)
    assert act(client, people["tech2"], request_id, "start-inspection").status_code == 404


def test_full_repair_lifecycle(client, s3, people, request_id):
    tech = people["tech"]
    assigned(client, people, request_id)

    assert act(client, tech, request_id, "start-work").status_code == 409  # must inspect first
    assert act(client, tech, request_id, "start-inspection").status_code == 200
    assert act(client, tech, request_id, "start-work").status_code == 409  # findings required

    report = client.put(
        f"/api/service-requests/{request_id}/report",
        json={"inspection_findings": "Low refrigerant", "technician_notes": "Check valve next visit"},
        headers=headers(tech),
    )
    assert report.status_code == 200
    started = act(client, tech, request_id, "start-work")
    assert started.status_code == 200 and started.json()["status"] == "IN_PROGRESS"
    assert "AFTER" in started.json()["allowed_upload_categories"]

    assert act(client, tech, request_id, "complete").status_code == 409  # needs work summary
    client.put(
        f"/api/service-requests/{request_id}/report",
        json={"work_performed": "Recharged refrigerant", "parts_used": "R-410A 2lb"},
        headers=headers(tech),
    )
    assert act(client, tech, request_id, "complete").status_code == 409  # needs after photo

    data = upload_photo(
        client, s3, tech, f"/api/service-requests/{request_id}/photos/upload-url",
        {**PNG, "category": "AFTER"}, PNG_BYTES,
    )
    assert client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(tech)).status_code == 200

    done = act(client, tech, request_id, "complete")
    assert done.status_code == 200
    assert done.json()["status"] == "COMPLETED"
    assert done.json()["completed_at"] is not None

    customer_view = client.get(f"/api/service-requests/{request_id}", headers=headers(people["customer"])).json()
    assert customer_view["work_performed"] == "Recharged refrigerant"
    assert customer_view["technician_notes"] is None  # staff-only
    assert [p["category"] for p in customer_view["photos"]] == ["AFTER"]
    # Nothing further is allowed once completed.
    assert act(client, people["admin"], request_id, "cancel").status_code == 409


def test_inspection_only_completion(client, people, request_id):
    tech = people["tech"]
    assigned(client, people, request_id)
    act(client, tech, request_id, "start-inspection")
    assert act(client, tech, request_id, "complete").status_code == 409
    client.put(
        f"/api/service-requests/{request_id}/report",
        json={"inspection_findings": "System healthy; filter replaced"},
        headers=headers(tech),
    )
    assert act(client, tech, request_id, "complete").json()["status"] == "COMPLETED"


def test_technician_upload_categories_follow_status(client, people, request_id):
    tech = people["tech"]
    assigned(client, people, request_id)
    url = f"/api/service-requests/{request_id}/photos/upload-url"
    assert client.post(url, json={**PNG, "category": "INSPECTION"}, headers=headers(tech)).status_code == 403
    act(client, tech, request_id, "start-inspection")
    assert client.post(url, json={**PNG, "category": "INSPECTION"}, headers=headers(tech)).status_code == 201
    assert client.post(url, json={**PNG, "category": "AFTER"}, headers=headers(tech)).status_code == 403
    # Customers cannot add technician evidence.
    assert client.post(url, json={**PNG, "category": "AFTER"}, headers=headers(people["customer"])).status_code == 403


# --- Customer approval ----------------------------------------------------------


def _awaiting(client, people, request_id):
    tech = people["tech"]
    assigned(client, people, request_id)
    act(client, tech, request_id, "start-inspection")
    assert act(client, tech, request_id, "request-customer-approval").status_code == 409
    client.put(
        f"/api/service-requests/{request_id}/report",
        json={"inspection_findings": "Compressor failing", "proposed_work": "Replace compressor"},
        headers=headers(tech),
    )
    response = act(client, tech, request_id, "request-customer-approval")
    assert response.json()["status"] == "AWAITING_CUSTOMER_APPROVAL"


def test_customer_approves_proposed_work(client, people, request_id):
    _awaiting(client, people, request_id)
    assert act(client, people["other"], request_id, "customer-decision", {"approve": True}).status_code == 404
    assert act(client, people["tech"], request_id, "customer-decision", {"approve": True}).status_code == 403
    response = act(client, people["customer"], request_id, "customer-decision", {"approve": True})
    assert response.json()["status"] == "IN_PROGRESS"


def test_customer_declines_proposed_work(client, people, request_id):
    _awaiting(client, people, request_id)
    response = act(
        client, people["customer"], request_id, "customer-decision", {"approve": False, "note": "Too costly"}
    )
    assert response.json()["status"] == "CANCELLED"
    assert response.json()["customer_decision_note"] == "Too costly"


def test_technician_cannot_skip_customer_approval(client, people, request_id):
    _awaiting(client, people, request_id)
    # Only the customer may move AWAITING_CUSTOMER_APPROVAL -> IN_PROGRESS.
    assert act(client, people["tech"], request_id, "start-work").status_code == 403
    assert act(client, people["tech"], request_id, "complete").status_code == 409


# --- Cancellation ---------------------------------------------------------------


def test_customer_cancels_before_assignment_only(client, people, request_id):
    assigned(client, people, request_id)
    assert act(client, people["customer"], request_id, "cancel").status_code == 403
    response = act(client, people["admin"], request_id, "cancel", {"note": "Duplicate"})
    assert response.json()["status"] == "CANCELLED"


def test_customer_can_cancel_submitted(client, people, request_id):
    response = act(client, people["customer"], request_id, "cancel", {"note": "Fixed itself"})
    assert response.json()["status"] == "CANCELLED"
    assert act(client, people["other"], request_id, "cancel").status_code == 404
