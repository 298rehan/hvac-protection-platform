"""Contact Us Lambda: validate the form, save it to DynamoDB, email a notification.

Called by API Gateway (HTTP API, payload format 2.0) on POST /contact.
Configuration comes from environment variables set by Terraform:
  TABLE_NAME       DynamoDB table for contact messages
  SENDER_EMAIL     SES-verified address the notification is sent from
  RECIPIENT_EMAIL  where notifications are delivered
CORS headers are added by API Gateway, not here.
"""

import base64
import html
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

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


def format_received(created_at):
    """'2026-10-15T08:15:30+00:00' -> '15 Oct 2026, 08:15 UTC'."""
    try:
        return datetime.fromisoformat(created_at).strftime("%d %b %Y, %H:%M UTC")
    except ValueError:
        return created_at


def build_text_body(item):
    """Plain-text version for email clients that don't show HTML."""
    return (
        "NEW CONTACT US MESSAGE - HVAC Protection Platform\n"
        "================================================\n\n"
        f"Name:       {item['name']}\n"
        f"Email:      {item['email']}\n"
        f"Received:   {format_received(item['created_at'])}\n"
        f"Message ID: {item['message_id']}\n\n"
        "Message:\n"
        "--------\n"
        f"{item['message']}\n\n"
        "Reply to this email to answer the customer directly.\n"
    )


def build_html_body(item):
    """Branded HTML version. Every customer value is escaped before it is inserted.

    Gmail-friendly: table layout, inline styles only, 600px max width that
    shrinks on phones.
    """
    name = html.escape(item["name"])
    email = html.escape(item["email"])
    mailto = html.escape("mailto:" + quote(item["email"], safe="@"))
    received = html.escape(format_received(item["created_at"]))
    message_id = html.escape(item["message_id"])
    # Escape first, then keep the customer's line breaks.
    message = html.escape(item["message"]).replace("\r\n", "\n").replace("\n", "<br>")

    label = "padding:6px 0;width:110px;font-size:13px;color:#64748b;vertical-align:top;"
    value = "padding:6px 0;font-size:15px;color:#0f172a;"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>New Contact Us Message</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr>
          <td style="background-color:#0f2f4a;padding:22px 28px;">
            <p style="margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#7db6da;">HVAC Protection Platform</p>
            <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:bold;">New Contact Us Message</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="{label}">Name</td><td style="{value}font-weight:bold;">{name}</td></tr>
              <tr><td style="{label}">Email</td><td style="{value}"><a href="{mailto}" style="color:#185a88;text-decoration:underline;">{email}</a></td></tr>
              <tr><td style="{label}">Received</td><td style="{value}">{received}</td></tr>
              <tr><td style="{label}">Message ID</td><td style="{value}font-family:Consolas,Menlo,monospace;font-size:13px;color:#475569;">{message_id}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Message</p>
            <div style="background-color:#f4f8fb;border-left:4px solid #1d6fa5;border-radius:6px;padding:16px 18px;font-size:15px;line-height:1.6;color:#0f172a;word-wrap:break-word;">{message}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
            Reply to this email to answer the customer directly. This message is also saved in the contact messages table.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"""


def send_notification(item):
    """Email the site owner. The customer's address is only used as Reply-To."""
    ses.send_email(
        FromEmailAddress=os.environ["SENDER_EMAIL"],
        Destination={"ToAddresses": [os.environ["RECIPIENT_EMAIL"]]},
        ReplyToAddresses=[item["email"]],
        Content={
            "Simple": {
                "Subject": {"Data": f"New Contact Us message from {item['name']}"},
                # Gmail and most clients show Html; the rest fall back to Text.
                "Body": {
                    "Html": {"Data": build_html_body(item), "Charset": "UTF-8"},
                    "Text": {"Data": build_text_body(item), "Charset": "UTF-8"},
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
