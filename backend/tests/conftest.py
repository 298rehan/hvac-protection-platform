"""Test fixtures.

Environment is set before the app is imported: an in-memory SQLite database,
moto-mocked S3/DynamoDB and dummy AWS credentials. No real AWS account, MySQL
server or secret is needed to run the suite.
"""

import functools
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

os.environ.update(
    {
        "DATABASE_URL": "sqlite://",
        "JWT_SECRET_KEY": "test-only-secret",
        "EMAIL_MODE": "console",
        "AWS_REGION": "ap-southeast-2",
        "AWS_DEFAULT_REGION": "ap-southeast-2",
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "dummy-secret-key-must-never-leak",
        "AWS_SESSION_TOKEN": "testing",
        "S3_BUCKET_NAME": "test-hvac-media",
        "DYNAMODB_ACTIVITY_TABLE": "test-hvac-activity",
        "ACTIVITY_WORKER_ENABLED": "false",
    }
)
os.environ.pop("AWS_PROFILE", None)

import bcrypt  # noqa: E402
import boto3  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from moto import mock_aws  # noqa: E402
from sqlalchemy import DefaultClause, create_engine, text  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

# Cheap bcrypt rounds keep the suite fast; production cost is unchanged.
bcrypt.gensalt = functools.partial(bcrypt.gensalt, rounds=4)

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.database.session import Base, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    BillingCycle,
    Plan,
    PlanRegion,
    Purchase,
    PurchaseStatus,
    User,
    UserRole,
)
from app.services import activity, storage  # noqa: E402

BUCKET = os.environ["S3_BUCKET_NAME"]
TABLE = os.environ["DYNAMODB_ACTIVITY_TABLE"]
REGION = os.environ["AWS_REGION"]

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
EXE_BYTES = b"MZ\x90\x00" + b"\x00" * 64

# One shared in-memory database; StaticPool keeps the single connection alive
# across the TestClient's worker thread.
# TEST_DATABASE_URL runs the suite against a real (disposable!) MySQL database,
# e.g. in CI. Every test drops and recreates all tables, so never point it at a
# database you care about.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if TEST_DATABASE_URL:
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
else:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    # The models' server defaults use MySQL's CURRENT_TIMESTAMP(6), which SQLite
    # cannot parse. Rows always get a Python-side timestamp anyway, so the test
    # schema simply uses SQLite's own CURRENT_TIMESTAMP. Production DDL comes
    # from the Alembic migrations and is untouched.
    for _table in Base.metadata.tables.values():
        for _column in _table.columns:
            default = _column.server_default
            if default is not None and "CURRENT_TIMESTAMP(6)" in str(getattr(default, "arg", "")):
                _column.server_default = DefaultClause(text("CURRENT_TIMESTAMP"))
SessionLocal.configure(bind=engine)


@pytest.fixture(autouse=True)
def database():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def aws():
    """Fresh mocked S3 bucket and DynamoDB table for every test."""
    with mock_aws():
        storage.reset_client()
        activity.reset_client()
        boto3.client("s3", region_name=REGION).create_bucket(
            Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION}
        )
        boto3.client("dynamodb", region_name=REGION).create_table(
            TableName=TABLE,
            KeySchema=[
                {"AttributeName": "request_id", "KeyType": "HASH"},
                {"AttributeName": "event_timestamp_id", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "request_id", "AttributeType": "S"},
                {"AttributeName": "event_timestamp_id", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield
        storage.reset_client()
        activity.reset_client()


@pytest.fixture
def s3():
    return boto3.client("s3", region_name=REGION)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


# --- Factories ----------------------------------------------------------------


def make_user(db, role: UserRole, email: str, *, state: str = "FL", active: bool = True) -> User:
    user = User(
        first_name=email.split("@")[0].title(),
        last_name="Tester",
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        is_active=active,
        phone="555-0100",
        address="1 Main St",
        city="Miami",
        state=state,
        zip_code="33101",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def headers(user: User) -> dict[str, str]:
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


def make_plan(db, *, max_ac_units: int = 1, name: str = "Premium") -> Plan:
    plan = Plan(
        name=name,
        slug=name.lower(),
        description="Test plan",
        features=["Inspection"],
        base_monthly_price=Decimal("29.99"),
        max_ac_units=max_ac_units,
    )
    plan.regions.append(PlanRegion(state_code="FL", monthly_price=Decimal("29.99")))
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def make_purchase(db, customer: User, plan: Plan, status: PurchaseStatus = PurchaseStatus.ACTIVE):
    now = datetime.now(timezone.utc)
    purchase = Purchase(
        user_id=customer.id,
        plan_id=plan.id,
        status=status,
        billing_cycle=BillingCycle.MONTHLY,
        state_code="FL",
        price=Decimal("29.99"),
        activated_at=now if status is PurchaseStatus.ACTIVE else None,
        expires_at=now + timedelta(days=30) if status is PurchaseStatus.ACTIVE else None,
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


AC_UNIT_PAYLOAD = {
    "brand": "Carrier",
    "model_number": "24ACC636",
    "serial_number": "SN-123",
    "ac_type": "CENTRAL_SPLIT",
    "address": "1 Main St",
    "city": "Miami",
    "state": "fl",
    "zip_code": "33101",
    "installation_date": "2020-05-01",
    "reported_condition": "FAIR",
}


@pytest.fixture
def people(db):
    """A customer with an active plan, a second customer, an admin and two technicians."""
    plan = make_plan(db, max_ac_units=2)
    customer = make_user(db, UserRole.CUSTOMER, "alice@example.com")
    other = make_user(db, UserRole.CUSTOMER, "bob@example.com")
    admin = make_user(db, UserRole.ADMIN, "admin@example.com")
    tech = make_user(db, UserRole.TECHNICIAN, "tina@example.com")
    tech2 = make_user(db, UserRole.TECHNICIAN, "tom@example.com")
    purchase = make_purchase(db, customer, plan)
    make_purchase(db, other, plan)
    return {
        "plan": plan,
        "purchase": purchase,
        "customer": customer,
        "other": other,
        "admin": admin,
        "tech": tech,
        "tech2": tech2,
    }


def register_unit(client, customer, **overrides) -> dict:
    response = client.post("/api/ac-units", json={**AC_UNIT_PAYLOAD, **overrides}, headers=headers(customer))
    assert response.status_code == 201, response.text
    return response.json()


def upload_photo(client, s3, user, url: str, body: dict, content: bytes) -> dict:
    """Request an upload URL, put the bytes where S3 would receive them, confirm."""
    response = client.post(url, json=body, headers=headers(user))
    assert response.status_code == 201, response.text
    data = response.json()
    s3.put_object(
        Bucket=BUCKET,
        Key=data["upload"]["fields"]["key"],
        Body=content,
        ContentType=body["content_type"],
    )
    return data
