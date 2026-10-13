"""Photo upload / metadata schemas. Image bytes never pass through the API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import PhotoCategory, PhotoStatus
from app.schemas.common import ORMModel

AllowedContentType = Literal["image/jpeg", "image/png", "image/webp"]


class PhotoUploadRequest(BaseModel):
    """What the browser says it is about to upload. Verified again after upload."""

    filename: str = Field(min_length=1, max_length=255)
    content_type: AllowedContentType
    size_bytes: int = Field(gt=0)


class ServiceRequestPhotoUploadRequest(PhotoUploadRequest):
    category: PhotoCategory


class PresignedPost(BaseModel):
    url: str
    fields: dict[str, str]


class PhotoUploadResponse(BaseModel):
    photo_id: int
    upload: PresignedPost
    expires_in: int
    max_bytes: int


class PhotoOut(ORMModel):
    id: int
    category: PhotoCategory
    status: PhotoStatus
    original_filename: str
    content_type: str | None
    size_bytes: int | None
    created_at: datetime
    confirmed_at: datetime | None
    # Short-lived presigned GET URL; only present for verified photos.
    url: str | None = None
