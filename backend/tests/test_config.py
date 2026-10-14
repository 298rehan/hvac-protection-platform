"""The backend reads its AWS and JWT settings from these exact environment names."""

from app.core.config import Settings


def test_settings_read_deployment_environment(monkeypatch):
    monkeypatch.setenv("AWS_REGION", "ap-southeast-2")
    monkeypatch.setenv("S3_BUCKET_NAME", "hvac-prod-media-594775505885-ap-southeast-2")
    monkeypatch.setenv("DYNAMODB_ACTIVITY_TABLE", "hvac-prod-service-activity")
    monkeypatch.setenv("JWT_SECRET_KEY", "from-the-environment")

    settings = Settings(_env_file=None)

    assert settings.aws_region == "ap-southeast-2"
    assert settings.s3_bucket_name == "hvac-prod-media-594775505885-ap-southeast-2"
    assert settings.dynamodb_activity_table == "hvac-prod-service-activity"
    assert settings.jwt_secret_key == "from-the-environment"


def test_no_aws_credentials_in_settings():
    """Credentials must come from the instance role, never from app config."""
    fields = {name.lower() for name in Settings.model_fields}
    assert not any("access_key" in f or "secret_access" in f or "session_token" in f for f in fields)
