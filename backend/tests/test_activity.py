"""DynamoDB activity events: outbox delivery, ordering, idempotency and filtering."""

import boto3
from botocore.exceptions import ClientError

from app.models import ActivityOutbox
from app.services import activity
from tests.conftest import REGION, TABLE, SessionLocal, headers, register_unit

FORBIDDEN_KEYS = {"password", "password_hash", "token", "access_token", "secret", "card", "email"}


def _submit(client, customer):
    unit = register_unit(client, customer)
    response = client.post(
        "/api/service-requests",
        json={"ac_unit_id": unit["id"], "service_type": "WATER_LEAK", "description": "Water under the unit."},
        headers=headers(customer),
    )
    assert response.status_code == 201
    return response.json()["id"]


def _dynamo_items(request_id):
    client = boto3.client("dynamodb", region_name=REGION)
    items = client.query(
        TableName=TABLE,
        KeyConditionExpression="request_id = :r",
        ExpressionAttributeValues={":r": {"S": str(request_id)}},
    )["Items"]
    return [{k: v["S"] for k, v in item.items()} for item in items]


def test_events_are_written_to_dynamodb_in_order(client, people):
    request_id = _submit(client, people["customer"])
    admin = headers(people["admin"])
    client.post(f"/api/service-requests/{request_id}/review", json={}, headers=admin)
    client.post(f"/api/service-requests/{request_id}/approve", json={}, headers=admin)
    client.post(
        f"/api/service-requests/{request_id}/assign", json={"technician_id": people["tech"].id}, headers=admin
    )
    # Background tasks have already delivered; this is a no-op safety net.
    activity.deliver_pending()

    items = _dynamo_items(request_id)
    assert [i["event_type"] for i in items] == [
        "REQUEST_SUBMITTED",
        "REVIEW_STARTED",
        "REQUEST_APPROVED",
        "TECHNICIAN_ASSIGNED",
    ]
    assert len({i["event_timestamp_id"] for i in items}) == len(items)
    assigned = items[-1]
    assert assigned["previous_status"] == "APPROVED"
    assert assigned["new_status"] == "ASSIGNED"
    assert assigned["technician_id"] == str(people["tech"].id)
    assert assigned["actor_role"] == "ADMIN"
    for item in items:
        assert not FORBIDDEN_KEYS & set(item)
        assert "@" not in item["description"]

    with SessionLocal() as db:
        assert all(row.delivered_at is not None for row in db.query(ActivityOutbox))


def test_redelivery_never_duplicates_or_overwrites(client, people):
    request_id = _submit(client, people["customer"])
    before = _dynamo_items(request_id)
    with SessionLocal() as db:
        for row in db.query(ActivityOutbox):
            row.delivered_at = None  # simulate a crash after put_item but before commit
        db.commit()
    assert activity.deliver_pending() == 1
    assert _dynamo_items(request_id) == before


def test_dynamodb_outage_does_not_block_business_change(client, people, monkeypatch):
    class Broken:
        def put_item(self, **_):
            raise ClientError(
                {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "x"}}, "PutItem"
            )

    monkeypatch.setattr(activity, "_client", lambda: Broken())
    request_id = _submit(client, people["customer"])  # still succeeds

    with SessionLocal() as db:
        row = db.query(ActivityOutbox).one()
        assert row.delivered_at is None
        assert row.attempts == 1
        assert row.last_error == "ProvisionedThroughputExceededException"
        assert row.next_attempt_at > row.created_at

    monkeypatch.undo()
    activity.reset_client()
    # The event is still visible from the outbox while DynamoDB is behind...
    history = client.get(f"/api/service-requests/{request_id}/history", headers=headers(people["customer"]))
    assert [e["event_type"] for e in history.json()] == ["REQUEST_SUBMITTED"]
    # ...and is delivered once the retry is due.
    with SessionLocal() as db:
        row = db.query(ActivityOutbox).one()
        row.next_attempt_at = row.created_at
        db.commit()
    assert activity.deliver_pending() == 1
    assert [i["event_type"] for i in _dynamo_items(request_id)] == ["REQUEST_SUBMITTED"]


def test_history_is_filtered_for_customers(client, people):
    request_id = _submit(client, people["customer"])
    admin, tech = headers(people["admin"]), headers(people["tech"])
    client.post(f"/api/service-requests/{request_id}/review", json={}, headers=admin)
    client.post(f"/api/service-requests/{request_id}/approve", json={}, headers=admin)
    client.post(
        f"/api/service-requests/{request_id}/assign", json={"technician_id": people["tech"].id}, headers=admin
    )
    client.post(f"/api/service-requests/{request_id}/start-inspection", json={}, headers=tech)
    client.put(
        f"/api/service-requests/{request_id}/report", json={"technician_notes": "internal"}, headers=tech
    )

    staff = client.get(f"/api/service-requests/{request_id}/history", headers=admin).json()
    customer = client.get(
        f"/api/service-requests/{request_id}/history", headers=headers(people["customer"])
    ).json()
    assert "REPORT_UPDATED" in [e["event_type"] for e in staff]
    assert "REPORT_UPDATED" not in [e["event_type"] for e in customer]
    assert all(e["actor_id"] is None and e["technician_id"] is None for e in customer)
    assert any(e["actor_id"] for e in staff)


def test_history_falls_back_to_outbox_when_dynamodb_unavailable(client, people, monkeypatch):
    request_id = _submit(client, people["customer"])

    class Broken:
        def get_paginator(self, _):
            raise ClientError({"Error": {"Code": "ServiceUnavailable", "Message": "x"}}, "Query")

    monkeypatch.setattr(activity, "_client", lambda: Broken())
    history = client.get(f"/api/service-requests/{request_id}/history", headers=headers(people["admin"]))
    assert history.status_code == 200
    assert [e["event_type"] for e in history.json()] == ["REQUEST_SUBMITTED"]


def test_sort_key_format():
    class FakeUser:
        id = 7

        class role:
            value = "ADMIN"

    with SessionLocal() as db:
        first = activity.record_event(db, request_id=1, event_type="X", actor=FakeUser, description="a")
        second = activity.record_event(db, request_id=1, event_type="X", actor=FakeUser, description="b")
    a, b = first.payload["event_timestamp_id"], second.payload["event_timestamp_id"]
    assert a != b
    timestamp, event_id = a.split("#")
    assert timestamp.endswith("Z") and len(timestamp) == len("2026-01-01T00:00:00.000000Z")
    assert event_id == first.event_id
