"""Application settings, loaded from environment variables / the .env file."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration lives here. Nothing is hardcoded elsewhere."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---------------------------------------------------------------
    app_name: str = "HVAC Protection Plan API"
    environment: str = "development"
    customer_app_url: str = "https://hvac-protection-platform.onrender.com"
    admin_app_url: str = "https://admin-frontend-cg6k.onrender.com"

    # --- Database ----------------------------------------------------------
    # MySQL via the PyMySQL driver. The real value always comes from .env;
    # this default only keeps the app importable without one.
    database_url: str = "mysql+pymysql://root:root@localhost:3306/hvac_db?charset=utf8mb4"

    # --- Security ----------------------------------------------------------
    jwt_secret_key: str = "insecure-development-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # --- CORS --------------------------------------------------------------
    cors_origins: str = "https://hvac-protection-platform.onrender.com,https://admin-frontend-cg6k.onrender.com"

    # --- Email -------------------------------------------------------------
    email_mode: str = "console"  # console | file | smtp
    email_output_dir: str = "sent_emails"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    email_from: str = "no-reply@hvacdemo.com"
    email_from_name: str = "Summit Air Protection Plans"
    admin_notification_email: str = "admin@hvacdemo.com"

    # --- AWS ---------------------------------------------------------------
    # Credentials are never configured here. boto3 finds them itself: the EC2
    # instance role in production, or AWS_PROFILE / ~/.aws locally.
    aws_region: str = "ap-southeast-2"
    # Empty means "not configured": photo endpoints return 503 and activity
    # events stay in the MySQL outbox until a table is configured.
    s3_bucket_name: str = ""
    dynamodb_activity_table: str = ""

    # --- Photo uploads -----------------------------------------------------
    upload_max_bytes: int = 10 * 1024 * 1024
    upload_url_expiry_seconds: int = 300
    download_url_expiry_seconds: int = 300
    max_photos_per_category: int = 10
    # Unconfirmed uploads older than this are removed (row + S3 object).
    pending_upload_ttl_minutes: int = 60

    # --- Activity outbox worker -------------------------------------------
    activity_worker_enabled: bool = True
    activity_worker_interval_seconds: int = 30

    @field_validator("email_mode")
    @classmethod
    def _validate_email_mode(cls, value: str) -> str:
        allowed = {"console", "file", "smtp"}
        normalised = value.strip().lower()
        if normalised not in allowed:
            raise ValueError(f"EMAIL_MODE must be one of {sorted(allowed)}")
        return normalised

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS_ORIGINS is a comma-separated string so it stays .env friendly."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is only parsed once per process."""
    return Settings()


settings = get_settings()
