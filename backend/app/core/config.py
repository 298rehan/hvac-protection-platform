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
    customer_app_url: str = "http://localhost:3000"
    admin_app_url: str = "http://localhost:3001"

    # --- Database ----------------------------------------------------------
    # MySQL via the PyMySQL driver. The real value always comes from .env;
    # this default only keeps the app importable without one.
    database_url: str = "mysql+pymysql://root:root@localhost:3306/hvac_db?charset=utf8mb4"

    # --- Security ----------------------------------------------------------
    jwt_secret_key: str = "insecure-development-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    # --- CORS --------------------------------------------------------------
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

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
