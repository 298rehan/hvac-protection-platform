"""Photo upload authorisation, validation and S3 verification."""

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from botocore.exceptions import ClientError

from app.models import Photo, PhotoStatus
from app.services import photo_service
from tests.conftest import (
    BUCKET,
    EXE_BYTES,
    JPEG_BYTES,
    PNG_BYTES,
    SessionLocal,
    headers,
    register_unit,
    upload_photo,
)

PNG = {"filename": "front.png", "content_type": "image/png", "size_bytes": len(PNG_BYTES)}


def _upload_url(unit_id):
    return f"/api/ac-units/{unit_id}/photos/upload-url"


def test_presigned_post_pins_key_type_and_size(client, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    response = client.post(
        _upload_url(unit["id"]),
        json={**PNG, "filename": "../../etc/passwd/../evil.png"},
        headers=headers(customer),
    )
    assert response.status_code == 201
    data = response.json()
    key = data["upload"]["fields"]["key"]
    assert key.startswith(f"customers/{customer.id}/ac-units/{unit['id']}/initial/")
    assert key.endswith(".png") and ".." not in key
    assert data["expires_in"] <= 300

    policy = json.loads(base64.b64decode(data["upload"]["fields"]["policy"]))
    conditions = policy["conditions"]
    assert {"Content-Type": "image/png"} in conditions
    assert ["content-length-range", 1, data["max_bytes"]] in conditions
    # Only a signed policy is returned - never the secret access key. (A
    # session token appears when signing with temporary role credentials; it
    # cannot sign anything on its own.)
    assert "dummy-secret-key-must-never-leak" not in json.dumps(data)


@pytest.mark.parametrize(
    "body, expected",
    [
        ({**PNG, "content_type": "application/x-msdownload"}, 422),
        ({**PNG, "content_type": "image/svg+xml"}, 422),
        ({**PNG, "filename": "setup.exe"}, 400),
        ({**PNG, "filename": "noextension"}, 400),
        ({**PNG, "size_bytes": 50 * 1024 * 1024}, 413),
        ({**PNG, "size_bytes": 0}, 422),
    ],
)
def test_invalid_files_rejected_before_upload(client, people, body, expected):
    unit = register_unit(client, people["customer"])
    response = client.post(_upload_url(unit["id"]), json=body, headers=headers(people["customer"]))
    assert response.status_code == expected


def test_cannot_request_upload_for_someone_elses_unit(client, people):
    unit = register_unit(client, people["customer"])
    for intruder in ("other", "tech"):
        response = client.post(_upload_url(unit["id"]), json=PNG, headers=headers(people[intruder]))
        assert response.status_code in (403, 404)


def test_confirm_verifies_and_accepts_real_image(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, PNG_BYTES)

    confirmed = client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["status"] == "UPLOADED"
    assert body["content_type"] == "image/png"
    assert body["size_bytes"] == len(PNG_BYTES)
    assert "X-Amz-Signature" in body["url"]  # short-lived presigned GET, not a public URL

    detail = client.get(f"/api/ac-units/{unit['id']}", headers=headers(customer)).json()
    assert [p["id"] for p in detail["photos"]] == [data["photo_id"]]


def test_disguised_executable_is_rejected_and_deleted(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, EXE_BYTES)
    key = data["upload"]["fields"]["key"]

    response = client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))
    assert response.status_code == 400
    with SessionLocal() as db:
        assert db.get(Photo, data["photo_id"]) is None
    with pytest.raises(ClientError):
        s3.head_object(Bucket=BUCKET, Key=key)


def test_content_must_match_declared_type(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, JPEG_BYTES)
    response = client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))
    assert response.status_code == 400


def test_confirm_before_upload_is_a_conflict(client, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = client.post(_upload_url(unit["id"]), json=PNG, headers=headers(customer)).json()
    response = client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))
    assert response.status_code == 409


def test_only_the_uploader_can_confirm(client, s3, people):
    unit = register_unit(client, people["customer"])
    data = upload_photo(client, s3, people["customer"], _upload_url(unit["id"]), PNG, PNG_BYTES)
    assert (
        client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(people["other"])).status_code
        == 404
    )
    # Admins can see the photo but did not upload it.
    assert (
        client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(people["admin"])).status_code
        == 404
    )


def test_photo_view_access(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, PNG_BYTES)
    client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))

    url = f"/api/photos/{data['photo_id']}"
    assert client.get(url, headers=headers(customer)).status_code == 200
    assert client.get(url, headers=headers(people["admin"])).status_code == 200
    assert client.get(url, headers=headers(people["other"])).status_code == 404
    assert client.get(url, headers=headers(people["tech"])).status_code == 404
    assert client.get(url).status_code == 401


def test_per_category_photo_limit(client, people, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_photos_per_category", 2)
    unit = register_unit(client, people["customer"])
    own = headers(people["customer"])
    for _ in range(2):
        assert client.post(_upload_url(unit["id"]), json=PNG, headers=own).status_code == 201
    assert client.post(_upload_url(unit["id"]), json=PNG, headers=own).status_code == 409


def test_stale_pending_uploads_are_purged(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, PNG_BYTES)
    key = data["upload"]["fields"]["key"]
    with SessionLocal() as db:
        photo = db.get(Photo, data["photo_id"])
        photo.created_at = datetime.now(timezone.utc) - timedelta(hours=3)
        db.commit()

    assert photo_service.purge_stale_uploads() == 1
    with SessionLocal() as db:
        assert db.get(Photo, data["photo_id"]) is None
    with pytest.raises(ClientError):
        s3.head_object(Bucket=BUCKET, Key=key)


def test_uploads_return_503_when_storage_not_configured(client, people, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "s3_bucket_name", "")
    unit = register_unit(client, people["customer"])
    response = client.post(_upload_url(unit["id"]), json=PNG, headers=headers(people["customer"]))
    assert response.status_code == 503


def test_confirmed_photo_rows_store_only_metadata(client, s3, people):
    customer = people["customer"]
    unit = register_unit(client, customer)
    data = upload_photo(client, s3, customer, _upload_url(unit["id"]), PNG, PNG_BYTES)
    client.post(f"/api/photos/{data['photo_id']}/confirm", headers=headers(customer))
    with SessionLocal() as db:
        photo = db.get(Photo, data["photo_id"])
        assert photo.status is PhotoStatus.UPLOADED
        assert photo.uploaded_by_user_id == customer.id
        assert photo.s3_key == data["upload"]["fields"]["key"]
        assert not hasattr(photo, "data") and not hasattr(photo, "content")
