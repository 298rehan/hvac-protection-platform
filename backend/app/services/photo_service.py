"""Photo upload authorisation, verification and cleanup.

Flow:
1. The caller has already authorised access to the AC unit / service request.
2. `create_upload` checks type, size and per-category limits, builds the S3 key
   itself (a client-supplied key is never used) and returns a presigned POST.
   The photo row starts as PENDING.
3. The browser uploads straight to S3.
4. `confirm_upload` inspects the stored object - size and leading bytes - and
   only then marks the photo UPLOADED. Anything that fails is deleted.
5. PENDING rows that are never confirmed are purged with their objects.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import SessionLocal
from app.models import (
    TERMINAL_SERVICE_REQUEST_STATUSES,
    AcUnit,
    Photo,
    PhotoCategory,
    PhotoStatus,
    ServiceRequest,
    ServiceRequestStatus as S,
    User,
    UserRole,
)
from app.schemas.photo import PhotoOut, PhotoUploadRequest, PhotoUploadResponse, PresignedPost
from app.services import activity, storage

logger = logging.getLogger("app.photos")

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _safe_filename(filename: str) -> str:
    """Basename only, with path separators and control characters removed."""
    name = os.path.basename(filename.replace("\\", "/"))
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '<>:"|?*')
    return name.strip()[:255] or "photo"


def _validate(payload: PhotoUploadRequest) -> str:
    """Return the cleaned filename, or raise if the declared file is unacceptable."""
    max_mb = settings.upload_max_bytes // (1024 * 1024)
    if payload.size_bytes > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Photos must be {max_mb} MB or smaller.",
        )
    filename = _safe_filename(payload.filename)
    extension = os.path.splitext(filename)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG or WebP images can be uploaded.",
        )
    return filename


def _key(prefix: str, content_type: str) -> str:
    return f"{prefix}/{uuid.uuid4().hex}.{storage.ALLOWED_CONTENT_TYPES[content_type]}"


def _create(
    db: Session,
    *,
    actor: User,
    customer_id: int,
    category: PhotoCategory,
    key_prefix: str,
    payload: PhotoUploadRequest,
    ac_unit_id: int | None = None,
    service_request_id: int | None = None,
) -> PhotoUploadResponse:
    storage.require_configured()
    filename = _validate(payload)

    existing = db.scalar(
        select(func.count())
        .select_from(Photo)
        .where(
            Photo.category == category,
            Photo.ac_unit_id == ac_unit_id if ac_unit_id else Photo.ac_unit_id.is_(None),
            Photo.service_request_id == service_request_id
            if service_request_id
            else Photo.service_request_id.is_(None),
        )
    )
    if existing >= settings.max_photos_per_category:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You can attach up to {settings.max_photos_per_category} photos here.",
        )

    key = _key(key_prefix, payload.content_type)
    try:
        presigned = storage.presigned_upload(
            key=key, content_type=payload.content_type, max_bytes=settings.upload_max_bytes
        )
    except storage.StorageError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo storage is temporarily unavailable. Please try again.",
        ) from None

    photo = Photo(
        customer_id=customer_id,
        ac_unit_id=ac_unit_id,
        service_request_id=service_request_id,
        category=category,
        status=PhotoStatus.PENDING,
        s3_key=key,
        original_filename=filename,
        declared_content_type=payload.content_type,
        uploaded_by_user_id=actor.id,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return PhotoUploadResponse(
        photo_id=photo.id,
        upload=PresignedPost(url=presigned["url"], fields=presigned["fields"]),
        expires_in=settings.upload_url_expiry_seconds,
        max_bytes=settings.upload_max_bytes,
    )


def create_ac_unit_upload(
    db: Session, *, actor: User, unit: AcUnit, payload: PhotoUploadRequest
) -> PhotoUploadResponse:
    """Initial-condition photo. Only the owning customer may upload."""
    if actor.role is not UserRole.CUSTOMER or unit.customer_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can add photos to this AC unit.",
        )
    return _create(
        db,
        actor=actor,
        customer_id=unit.customer_id,
        category=PhotoCategory.INITIAL,
        key_prefix=f"customers/{unit.customer_id}/ac-units/{unit.id}/initial",
        payload=payload,
        ac_unit_id=unit.id,
    )


def allowed_request_categories(request: ServiceRequest, user: User) -> list[PhotoCategory]:
    """Which photo categories this user may add to the request right now."""
    s = request.status
    if user.role is UserRole.CUSTOMER and request.customer_id == user.id:
        return [] if s in TERMINAL_SERVICE_REQUEST_STATUSES else [PhotoCategory.CUSTOMER]
    if user.role is UserRole.TECHNICIAN and request.assigned_technician_id == user.id:
        allowed = []
        if s in {S.INSPECTION_IN_PROGRESS, S.AWAITING_CUSTOMER_APPROVAL}:
            allowed.append(PhotoCategory.INSPECTION)
        if s in {S.INSPECTION_IN_PROGRESS, S.AWAITING_CUSTOMER_APPROVAL, S.IN_PROGRESS}:
            allowed.append(PhotoCategory.BEFORE)
        if s is S.IN_PROGRESS:
            allowed.append(PhotoCategory.AFTER)
        return allowed
    return []


def create_request_upload(
    db: Session,
    *,
    actor: User,
    request: ServiceRequest,
    category: PhotoCategory,
    payload: PhotoUploadRequest,
) -> PhotoUploadResponse:
    if category not in allowed_request_categories(request, actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You cannot add {category.value.lower()} photos to this request right now.",
        )
    return _create(
        db,
        actor=actor,
        customer_id=request.customer_id,
        category=category,
        key_prefix=f"service-requests/{request.id}/{category.value.lower()}",
        payload=payload,
        service_request_id=request.id,
    )


def _discard(db: Session, photo: Photo) -> None:
    key = photo.s3_key
    db.delete(photo)
    db.commit()
    storage.delete_object(key)


def confirm_upload(db: Session, *, photo: Photo, actor: User) -> Photo:
    """Verify the uploaded object and accept the photo."""
    if photo.uploaded_by_user_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Photo {photo.id} was not found."
        )
    if photo.status is PhotoStatus.UPLOADED:
        return photo  # idempotent: a retried confirm is harmless
    storage.require_configured()

    try:
        info = storage.inspect_object(photo.s3_key)
    except storage.StorageError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Photo storage is temporarily unavailable. Please try again.",
        ) from None
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The file has not finished uploading yet.",
        )

    if info.size <= 0 or info.size > settings.upload_max_bytes:
        _discard(db, photo)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is too large."
        )
    sniffed = storage.sniff_content_type(info.head)
    if sniffed is None or sniffed != photo.declared_content_type:
        _discard(db, photo)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid JPEG, PNG or WebP image.",
        )

    photo.status = PhotoStatus.UPLOADED
    photo.content_type = sniffed
    photo.size_bytes = info.size
    photo.confirmed_at = datetime.now(timezone.utc)
    if photo.service_request_id is not None:
        activity.record_event(
            db,
            request_id=photo.service_request_id,
            event_type=activity.PHOTOS_UPLOADED,
            actor=actor,
            description=f"{photo.category.value.title()} photo added.",
        )
    db.commit()
    db.refresh(photo)
    return photo


def can_view(db: Session, photo: Photo, user: User) -> bool:
    # Imported lazily: both services import this module.
    from app.services import ac_unit_service, service_request_service

    if photo.ac_unit_id is not None:
        unit = db.get(AcUnit, photo.ac_unit_id)
        return unit is not None and ac_unit_service.can_view(db, unit, user)
    request = db.get(ServiceRequest, photo.service_request_id)
    return request is not None and service_request_service.can_view(request, user)


def get_for_viewer(db: Session, photo_id: int, user: User) -> Photo:
    photo = db.get(Photo, photo_id)
    if photo is None or not can_view(db, photo, user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Photo {photo_id} was not found."
        )
    return photo


def delete_photo(db: Session, *, photo: Photo, actor: User) -> None:
    """Uploaders may remove their own photo while the record is still open.

    Photos on finished requests are kept as evidence, and AC unit photos are
    kept once the unit has service history.
    """
    from app.services import ac_unit_service

    if photo.uploaded_by_user_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only remove your own photos."
        )
    if photo.status is PhotoStatus.UPLOADED:
        if photo.service_request_id is not None:
            request = db.get(ServiceRequest, photo.service_request_id)
            if request is not None and request.status in TERMINAL_SERVICE_REQUEST_STATUSES:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Photos on a closed request are kept as a record and cannot be removed.",
                )
        elif ac_unit_service.has_service_history(db, photo.ac_unit_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This unit has service history, so its photos are kept as a record.",
            )
    _discard(db, photo)


def serialise(photo: Photo) -> PhotoOut:
    out = PhotoOut.model_validate(photo)
    if photo.status is PhotoStatus.UPLOADED and storage.is_configured():
        try:
            out.url = storage.presigned_download(photo.s3_key, content_type=photo.content_type)
        except storage.StorageError:
            out.url = None
    return out


def purge_stale_uploads(session_factory=None) -> int:
    """Remove PENDING photos that were never confirmed, with their S3 objects."""
    factory = session_factory or SessionLocal
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.pending_upload_ttl_minutes)
    removed = 0
    with factory() as db:
        stale = db.execute(
            select(Photo)
            .where(Photo.status == PhotoStatus.PENDING, Photo.created_at < cutoff)
            .limit(200)
        ).scalars().all()
        keys = [p.s3_key for p in stale]
        for photo in stale:
            db.delete(photo)
            removed += 1
        db.commit()
    if storage.is_configured():
        for key in keys:
            storage.delete_object(key)
    return removed
