"""Contact Us Lambda: validate the form, save it to DynamoDB, email a notification.

Called by API Gateway (HTTP API, payload format 2.0) on POST /contact.
Configuration comes from environment variables set by Terraform:
  TABLE_NAME       DynamoDB table for contact messages
  SENDER_EMAIL     SES-verified address the notification is sent from
  RECIPIENT_EMAIL  where notifications are delivered
CORS headers are added by API Gateway, not here.
"""

import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_BODY_BYTES = 20_000
NAME_MAX = 100
EMAIL_MAX = 254
MESSAGE_MIN = 10
MESSAGE_MAX = 5000
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
# Names must be one plain line; messages may also contain tabs and line breaks.
NAME_BAD_CHARS = re.compile(r"[\x00-\x1f\x7f]")
MESSAGE_BAD_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

dynamodb = boto3.client("dynamodb")
ses = boto3.client("sesv2")


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def validate(data):
    """Return (clean_fields, errors). errors maps field name -> message."""
    errors = {}
    name = data.get("name")
    email = data.get("email")
    message = data.get("message")

    name = name.strip() if isinstance(name, str) else ""
    email = email.strip() if isinstance(email, str) else ""
    message = message.strip() if isinstance(message, str) else ""

    if not name:
        errors["name"] = "Please enter your name."
    elif len(name) > NAME_MAX or NAME_BAD_CHARS.search(name):
        errors["name"] = f"Name must be a single line of up to {NAME_MAX} characters."

    if not email:
        errors["email"] = "Please enter your email address."
    elif len(email) > EMAIL_MAX or not EMAIL_PATTERN.match(email):
        errors["email"] = "Please enter a valid email address."

    if len(message) < MESSAGE_MIN:
        errors["message"] = f"Please write at least {MESSAGE_MIN} characters."
    elif len(message) > MESSAGE_MAX:
        errors["message"] = f"Messages can be up to {MESSAGE_MAX} characters."
    elif MESSAGE_BAD_CHARS.search(message):
        errors["message"] = "The message contains characters that are not allowed."

    return {"name": name, "email": email, "message": message}, errors


def send_notification(item):
    """Email the site owner. The customer's address is only used as Reply-To."""
    ses.send_email(
        FromEmailAddress=os.environ["SENDER_EMAIL"],
        Destination={"ToAddresses": [os.environ["RECIPIENT_EMAIL"]]},
        ReplyToAddresses=[item["email"]],
        Content={
            "Simple": {
                "Subject": {"Data": f"New Contact Us message from {item['name']}"},
                "Body": {
                    "Text": {
                        "Data": (
                            f"Name: {item['name']}\n"
                            f"Email: {item['email']}\n"
                            f"Received (UTC): {item['created_at']}\n"
                            f"Message ID: {item['message_id']}\n\n"
                            f"{item['message']}\n"
                        )
                    }
                },
            }
        },
    )


def handler(event, context):
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return response(400, {"error": "The request body could not be read."})

    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        return response(413, {"error": "The message is too large."})

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return response(400, {"error": "The request body must be JSON."})
    if not isinstance(data, dict):
        return response(400, {"error": "The request body must be a JSON object."})

    fields, errors = validate(data)
    if errors:
        return response(400, {"error": "Please correct the highlighted fields.", "fields": errors})

    item = {
        "message_id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **fields,
    }

    # 1. Save first: the stored message is the source of truth.
    try:
        dynamodb.put_item(
            TableName=os.environ["TABLE_NAME"],
            Item={key: {"S": value} for key, value in item.items()},
            ConditionExpression="attribute_not_exists(message_id)",
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("Saving message failed: %s", type(exc).__name__)
        return response(500, {"error": "Sorry, we couldn't send your message. Please try again later."})

    # 2. Notify. A failed email is logged but does not fail the request,
    #    because the message is already saved.
    try:
        send_notification(item)
        logger.info("Message %s saved and notification sent", item["message_id"])
    except (BotoCoreError, ClientError) as exc:
        code = exc.response["Error"]["Code"] if isinstance(exc, ClientError) else type(exc).__name__
        logger.error("Message %s saved, but notification email failed: %s", item["message_id"], code)

    return response(201, {"message": "Thank you! Your message has been received.", "id": item["message_id"]})
