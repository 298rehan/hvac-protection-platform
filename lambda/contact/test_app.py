"""Tests for the Contact Us Lambda. DynamoDB and SES are mocked with moto.

Run from the repository root:
    backend/.venv/Scripts/python -m pytest lambda/contact      (Windows)
    python -m pytest lambda/contact                             (Linux / CI)
"""

import base64
import importlib
import json

import boto3
import pytest
from moto import mock_aws

REGION = "ap-southeast-2"
TABLE = "test-contact-messages"
SENDER = "owner@example.com"


@pytest.fixture
def app(monkeypatch):
    for key, value in {
        "AWS_DEFAULT_REGION": REGION,
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "TABLE_NAME": TABLE,
        "SENDER_EMAIL": SENDER,
        "RECIPIENT_EMAIL": SENDER,
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("AWS_PROFILE", raising=False)

    with mock_aws():
        boto3.client("dynamodb", region_name=REGION).create_table(
            TableName=TABLE,
            KeySchema=[{"AttributeName": "message_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "message_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("ses", region_name=REGION).verify_email_identity(EmailAddress=SENDER)
        import app as module  # noqa: PLC0415 - clients must be created inside the mock

        yield importlib.reload(module)


def call(app, body, *, raw=None, base64_encode=False):
    payload = raw if raw is not None else json.dumps(body)
    if base64_encode:
        payload = base64.b64encode(payload.encode()).decode()
    result = app.handler({"body": payload, "isBase64Encoded": base64_encode}, None)
    return result["statusCode"], json.loads(result["body"])


VALID = {"name": "Maria Alvarez", "email": "maria@example.com", "message": "My AC is leaking water."}


def stored_items():
    return boto3.client("dynamodb", region_name=REGION).scan(TableName=TABLE)["Items"]


def test_valid_message_is_saved(app):
    status, body = call(app, VALID)
    assert status == 201
    items = stored_items()
    assert len(items) == 1
    item = {k: v["S"] for k, v in items[0].items()}
    assert item["message_id"] == body["id"]
    assert item["name"] == "Maria Alvarez"
    assert item["email"] == "maria@example.com"
    assert item["created_at"].endswith("+00:00")


def test_notification_uses_verified_sender_and_customer_reply_to(app, monkeypatch):
    sent = {}
    monkeypatch.setattr(app.ses, "send_email", lambda **kwargs: sent.update(kwargs))
    call(app, VALID)
    assert sent["FromEmailAddress"] == SENDER
    assert sent["Destination"] == {"ToAddresses": [SENDER]}
    assert sent["ReplyToAddresses"] == ["maria@example.com"]


def test_email_failure_still_saves_message(app, monkeypatch):
    from botocore.exceptions import ClientError

    def fail(**_):
        raise ClientError({"Error": {"Code": "MessageRejected", "Message": "not verified"}}, "SendEmail")

    monkeypatch.setattr(app.ses, "send_email", fail)
    status, body = call(app, VALID)
    assert status == 201
    assert "not verified" not in json.dumps(body)
    assert len(stored_items()) == 1


def test_database_failure_returns_generic_error(app, monkeypatch):
    from botocore.exceptions import ClientError

    def fail(**_):
        raise ClientError({"Error": {"Code": "AccessDeniedException", "Message": "arn:secret"}}, "PutItem")

    monkeypatch.setattr(app.dynamodb, "put_item", fail)
    status, body = call(app, VALID)
    assert status == 500
    assert "arn" not in json.dumps(body) and "AccessDenied" not in json.dumps(body)


@pytest.mark.parametrize(
    "change, field",
    [
        ({"name": ""}, "name"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 101}, "name"),
        ({"name": "Bob\nBcc: evil@example.com"}, "name"),
        ({"email": ""}, "email"),
        ({"email": "not-an-email"}, "email"),
        ({"email": "a@b"}, "email"),
        ({"email": "two@@example.com"}, "email"),
        ({"message": "short"}, "message"),
        ({"message": "x" * 5001}, "message"),
        ({"message": "bad \x00 byte in message"}, "message"),
        ({"name": 123}, "name"),
    ],
)
def test_invalid_input_rejected(app, change, field):
    status, body = call(app, {**VALID, **change})
    assert status == 400
    assert field in body["fields"]
    assert stored_items() == []


def test_multiline_message_allowed(app):
    status, _ = call(app, {**VALID, "message": "Line one\nLine two\twith a tab"})
    assert status == 201


def test_malformed_and_oversized_bodies(app):
    assert call(app, None, raw="{not json")[0] == 400
    assert call(app, None, raw="[1, 2]")[0] == 400
    assert call(app, None, raw="")[0] == 400
    assert call(app, None, raw="x" * 20_001)[0] == 413
    assert stored_items() == []


def test_base64_body_supported(app):
    status, _ = call(app, None, raw=json.dumps(VALID), base64_encode=True)
    assert status == 201


def test_no_credentials_or_config_in_responses(app):
    _, body = call(app, VALID)
    text = json.dumps(body)
    assert TABLE not in text and SENDER not in text


def test_email_has_html_and_text_versions(app, monkeypatch):
    sent = {}
    monkeypatch.setattr(app.ses, "send_email", lambda **kwargs: sent.update(kwargs))
    call(app, {**VALID, "message": "Line one\nLine two"})
    body = sent["Content"]["Simple"]["Body"]
    html_body, text_body = body["Html"]["Data"], body["Text"]["Data"]

    assert "New Contact Us Message" in html_body
    assert '<a href="mailto:maria@example.com"' in html_body
    assert "Line one<br>Line two" in html_body
    assert "Maria Alvarez" in html_body and " UTC" in html_body
    assert body["Html"]["Charset"] == "UTF-8"

    assert "Maria Alvarez" in text_body and "maria@example.com" in text_body
    assert "Line one\nLine two" in text_body and "Message ID:" in text_body
    assert "<" not in text_body


def test_user_content_is_html_escaped(app, monkeypatch):
    sent = {}
    monkeypatch.setattr(app.ses, "send_email", lambda **kwargs: sent.update(kwargs))
    status, _ = call(app, {
        "name": "<b>Evil</b>",
        "email": 'x"onmouseover=alert(1)<a@example.com',
        "message": "<script>alert('hi')</script> & <img src=x onerror=alert(1)>",
    })
    assert status == 201
    html_body = sent["Content"]["Simple"]["Body"]["Html"]["Data"]
    assert "<script>" not in html_body and "<img" not in html_body and "<b>Evil" not in html_body
    assert "&lt;script&gt;" in html_body and "&amp;" in html_body and "&lt;b&gt;Evil&lt;/b&gt;" in html_body
    assert 'onmouseover=alert(1)<a' not in html_body
    assert '"onmouseover' not in html_body  # the quote cannot break out of the href attribute


def test_received_time_is_readable(app):
    assert app.format_received("2026-10-15T08:05:30+00:00") == "15 Oct 2026, 08:05 UTC"
    assert app.format_received("not a date") == "not a date"
