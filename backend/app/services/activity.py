"""Service-request activity history, stored in DynamoDB via a MySQL outbox.

Consistency guarantees
----------------------
* `record_event` only adds an `ActivityOutbox` row to the caller's SQLAlchemy
  session. The event therefore commits (or rolls back) atomically with the
  business change it describes - MySQL can never show a status the history
  does not, or vice versa.
* Delivery to DynamoDB happens after commit: immediately via a background task,
  and again from a periodic worker that retries failures with exponential
  backoff. A DynamoDB outage delays history; it never blocks or reverses a
  business change.
* Delivery is at-least-once. Each item is written with
  `attribute_not_exists(event_timestamp_id)`, so a retried event can never
  overwrite or duplicate an existing one - the table is append-only.
* Reads merge DynamoDB items with any not-yet-delivered outbox rows, so a user
  sees their own action immediately even while delivery is pending.

Never put passwords, tokens, secrets, payment details or free-text customer
data into an event. Descriptions are short, system-generated sentences.
"""

from __future__ import annotations

import logging
import threading
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import SessionLocal
from app.models import ActivityOutbox, ServiceRequestStatus, User, UserRole

logger = logging.getLogger("app.activity")

# Event types (stored as plain strings).
REQUEST_SUBMITTED = "REQUEST_SUBMITTED"
PHOTOS_UPLOADED = "PHOTOS_UPLOADED"
REVIEW_STARTED = "REVIEW_STARTED"
REQUEST_APPROVED = "REQUEST_APPROVED"
REQUEST_REJECTED = "REQUEST_REJECTED"
TECHNICIAN_ASSIGNED = "TECHNICIAN_ASSIGNED"
TECHNICIAN_REASSIGNED = "TECHNICIAN_REASSIGNED"
INSPECTION_STARTED = "INSPECTION_STARTED"
REPORT_UPDATED = "REPORT_UPDATED"
CUSTOMER_APPROVAL_REQUESTED = "CUSTOMER_APPROVAL_REQUESTED"
CUSTOMER_APPROVED_WORK = "CUSTOMER_APPROVED_WORK"
CUSTOMER_DECLINED_WORK = "CUSTOMER_DECLINED_WORK"
REPAIR_STARTED = "REPAIR_STARTED"
REQUEST_COMPLETED = "REQUEST_COMPLETED"
REQUEST_CANCELLED = "REQUEST_CANCELLED"

VISIBLE_TO_CUSTOMER = "customer"
STAFF_ONLY = "staff"

MAX_BACKOFF = timedelta(hours=1)
DELIVERED_RETENTION = timedelta(days=30)
DESCRIPTION_LIMIT = 300


def _timestamp(moment: datetime) -> str:
    """Fixed-width UTC timestamp, so string order equals time order."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def record_event(
    db: Session,
    *,
    request_id: int,
    event_type: str,
    actor: User | None,
    description: str,
    previous_status: ServiceRequestStatus | None = None,
    new_status: ServiceRequestStatus | None = None,
    technician_id: int | None = None,
    visibility: str = VISIBLE_TO_CUSTOMER,
) -> ActivityOutbox:
    """Queue an event in the current transaction. The caller commits."""
    now = datetime.now(timezone.utc)
    event_id = str(uuid.uuid4())
    timestamp = _timestamp(now)
    item = {
        "request_id": str(request_id),
        # Timestamp first for ordering; the UUID makes same-microsecond events unique.
        "event_timestamp_id": f"{timestamp}#{event_id}",
        "event_id": event_id,
        "event_type": event_type,
        "event_timestamp": timestamp,
        "actor_id": str(actor.id) if actor else "system",
        "actor_role": actor.role.value if actor else "SYSTEM",
        "description": description[:DESCRIPTION_LIMIT],
        "visibility": visibility,
    }
    if previous_status is not None:
        item["previous_status"] = previous_status.value
    if new_status is not None:
        item["new_status"] = new_status.value
    if technician_id is not None:
        item["technician_id"] = str(technician_id)

    row = ActivityOutbox(event_id=event_id, request_id=request_id, payload=item, next_attempt_at=now)
    db.add(row)
    return row


# --- DynamoDB ---------------------------------------------------------------


def is_configured() -> bool:
    return bool(settings.dynamodb_activity_table)


@lru_cache
def _client():
    return boto3.client("dynamodb", region_name=settings.aws_region)


def reset_client() -> None:
    """Drop the cached client (used by tests that swap AWS mocks)."""
    _client.cache_clear()


def _to_dynamo(item: dict) -> dict:
    return {key: {"S": str(value)} for key, value in item.items()}


def _from_dynamo(item: dict) -> dict:
    return {key: value["S"] for key, value in item.items() if "S" in value}


def _schedule_retry(row: ActivityOutbox, error: str, now: datetime) -> None:
    row.attempts += 1
    delay = min(timedelta(seconds=30 * 2 ** (row.attempts - 1)), MAX_BACKOFF)
    row.next_attempt_at = now + delay
    row.last_error = error[:255]


def deliver_pending(
    session_factory: Callable[[], Session] | None = None, *, limit: int = 50
) -> int:
    """Copy due outbox rows to DynamoDB. Returns how many were delivered."""
    if not is_configured():
        return 0

    factory = session_factory or SessionLocal
    delivered = 0
    with factory() as db:
        now = datetime.now(timezone.utc)
        rows = (
            db.execute(
                select(ActivityOutbox)
                .where(ActivityOutbox.delivered_at.is_(None), ActivityOutbox.next_attempt_at <= now)
                .order_by(ActivityOutbox.id)
                .limit(limit)
                # SKIP LOCKED lets the request-time flush and the worker run side by side.
                .with_for_update(skip_locked=True)
            )
            .scalars()
            .all()
        )
        for row in rows:
            try:
                _client().put_item(
                    TableName=settings.dynamodb_activity_table,
                    Item=_to_dynamo(row.payload),
                    ConditionExpression="attribute_not_exists(event_timestamp_id)",
                )
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "ClientError")
                if code == "ConditionalCheckFailedException":
                    # Already written by an earlier attempt - append-only, nothing to do.
                    row.delivered_at = now
                    delivered += 1
                else:
                    logger.warning("Activity event %s not delivered: %s", row.event_id, code)
                    _schedule_retry(row, code, now)
                continue
            except BotoCoreError as exc:
                logger.warning(
                    "Activity event %s not delivered: %s", row.event_id, type(exc).__name__
                )
                _schedule_retry(row, type(exc).__name__, now)
                continue
            row.delivered_at = now
            delivered += 1
        db.commit()
    return delivered


def _query_dynamo(request_id: int) -> list[dict]:
    items: list[dict] = []
    paginator = _client().get_paginator("query")
    for page in paginator.paginate(
        TableName=settings.dynamodb_activity_table,
        KeyConditionExpression="request_id = :rid",
        ExpressionAttributeValues={":rid": {"S": str(request_id)}},
        ScanIndexForward=True,
    ):
        items.extend(_from_dynamo(item) for item in page.get("Items", []))
    return items


def list_events(db: Session, request_id: int) -> list[dict]:
    """Full, ordered history for a request (DynamoDB plus undelivered outbox rows)."""
    events: dict[str, dict] = {}
    dynamo_ok = False
    if is_configured():
        try:
            for item in _query_dynamo(request_id):
                events[item["event_id"]] = item
            dynamo_ok = True
        except (BotoCoreError, ClientError) as exc:
            logger.error("Could not read activity history: %s", type(exc).__name__)

    stmt = select(ActivityOutbox.payload).where(ActivityOutbox.request_id == request_id)
    if dynamo_ok:
        stmt = stmt.where(ActivityOutbox.delivered_at.is_(None))
    for payload in db.execute(stmt).scalars():
        events.setdefault(payload["event_id"], payload)

    return sorted(events.values(), key=lambda e: e["event_timestamp_id"])


def view_for(events: list[dict], viewer: User) -> list[dict]:
    """Customers see customer-visible events without staff identifiers."""
    if viewer.role is not UserRole.CUSTOMER:
        return events
    hidden = {"actor_id", "technician_id", "visibility"}
    return [
        {k: v for k, v in event.items() if k not in hidden}
        for event in events
        if event.get("visibility") == VISIBLE_TO_CUSTOMER
    ]


def purge_delivered(session_factory: Callable[[], Session] | None = None) -> int:
    """Delete outbox rows that reached DynamoDB long ago."""
    factory = session_factory or SessionLocal
    cutoff = datetime.now(timezone.utc) - DELIVERED_RETENTION
    with factory() as db:
        result = db.execute(
            delete(ActivityOutbox).where(
                ActivityOutbox.delivered_at.is_not(None), ActivityOutbox.delivered_at < cutoff
            )
        )
        db.commit()
        return result.rowcount or 0


# --- Background worker ------------------------------------------------------


class MaintenanceWorker:
    """Daemon thread: delivers outbox events and removes stale pending uploads.

    One uvicorn process runs one worker. SKIP LOCKED keeps it safe if more
    replicas are added later.
    """

    def __init__(self, interval_seconds: int) -> None:
        self._interval = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="maintenance-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=10)

    def _run(self) -> None:
        # Imported here to avoid a circular import (photo_service records events).
        from app.services import photo_service

        while not self._stop.wait(self._interval):
            for task in (deliver_pending, photo_service.purge_stale_uploads, purge_delivered):
                try:
                    task()
                except Exception:  # noqa: BLE001 - the loop must survive any failure
                    logger.exception("Maintenance task %s failed", task.__name__)
