"""Private S3 storage for photos.

The browser never receives AWS credentials. It gets a short-lived presigned POST
whose policy pins the exact object key, content type and size range, and later
short-lived presigned GET URLs for photos it is allowed to see. Uploaded objects
are then checked server-side (size + leading "magic" bytes) before the photo is
accepted - the browser-declared MIME type alone is never trusted.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger("app.storage")

# Allowed image types -> canonical file extension. HEIC is deliberately absent:
# most browsers cannot display it, so admins and technicians could not view it.
ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

SNIFF_BYTES = 16


class StorageError(Exception):
    """S3 could not be reached or refused the request."""


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    head: bytes  # first SNIFF_BYTES bytes of the object


def is_configured() -> bool:
    return bool(settings.s3_bucket_name)


def require_configured() -> None:
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo storage is not configured on this server.",
        )


@lru_cache
def _client():
    # SigV4 + virtual-hosted addressing is required for presigned POSTs to
    # buckets outside us-east-1.
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


def reset_client() -> None:
    """Drop the cached client (used by tests that swap AWS mocks)."""
    _client.cache_clear()


def sniff_content_type(head: bytes) -> str | None:
    """Identify an image from its leading bytes, or None if it is not allowed."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def presigned_upload(*, key: str, content_type: str, max_bytes: int) -> dict:
    """A presigned POST that only accepts this key, this type and up to max_bytes."""
    try:
        return _client().generate_presigned_post(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, max_bytes],
            ],
            ExpiresIn=settings.upload_url_expiry_seconds,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("Could not presign S3 upload: %s", type(exc).__name__)
        raise StorageError from exc


def presigned_download(key: str, *, content_type: str | None) -> str:
    params = {"Bucket": settings.s3_bucket_name, "Key": key, "ResponseContentDisposition": "inline"}
    if content_type:
        params["ResponseContentType"] = content_type
    try:
        return _client().generate_presigned_url(
            "get_object", Params=params, ExpiresIn=settings.download_url_expiry_seconds
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error("Could not presign S3 download: %s", type(exc).__name__)
        raise StorageError from exc


def inspect_object(key: str) -> ObjectInfo | None:
    """Size and leading bytes of an uploaded object, or None if it does not exist."""
    client = _client()
    try:
        head = client.head_object(Bucket=settings.s3_bucket_name, Key=key)
        body = client.get_object(
            Bucket=settings.s3_bucket_name, Key=key, Range=f"bytes=0-{SNIFF_BYTES - 1}"
        )["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        logger.error("Could not inspect S3 object: %s", code or type(exc).__name__)
        raise StorageError from exc
    except BotoCoreError as exc:
        logger.error("Could not inspect S3 object: %s", type(exc).__name__)
        raise StorageError from exc
    return ObjectInfo(size=int(head["ContentLength"]), head=body)


def delete_object(key: str) -> None:
    """Delete an object. Missing objects are fine; other failures are logged only.

    With versioning on this adds a delete marker; the bucket lifecycle rule
    expires the old version.
    """
    try:
        _client().delete_object(Bucket=settings.s3_bucket_name, Key=key)
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Could not delete S3 object %s: %s", key, type(exc).__name__)
