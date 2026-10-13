"""Photo endpoints that work on an existing photo record.

Upload URLs are issued from the owning resource (AC unit or service request)
so the authorisation check happens against that resource.
"""

from fastapi import APIRouter, BackgroundTasks, Response, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.photo import PhotoOut
from app.services import activity, photo_service

router = APIRouter(prefix="/api/photos", tags=["Photos"])


@router.post("/{photo_id}/confirm", response_model=PhotoOut, summary="Confirm an upload")
def confirm_photo(photo_id: int, db: DbSession, user: CurrentUser, background: BackgroundTasks):
    """Verifies the stored object's size and file signature before accepting it."""
    photo = photo_service.get_for_viewer(db, photo_id, user)
    photo = photo_service.confirm_upload(db, photo=photo, actor=user)
    background.add_task(activity.deliver_pending)
    return photo_service.serialise(photo)


@router.get("/{photo_id}", response_model=PhotoOut, summary="Photo with a fresh view URL")
def get_photo(photo_id: int, db: DbSession, user: CurrentUser):
    return photo_service.serialise(photo_service.get_for_viewer(db, photo_id, user))


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove my photo")
def delete_photo(photo_id: int, db: DbSession, user: CurrentUser):
    photo = photo_service.get_for_viewer(db, photo_id, user)
    photo_service.delete_photo(db, photo=photo, actor=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
