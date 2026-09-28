"""Registration, login and token schemas."""

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserOut, _normalise_state


class CustomerRegisterRequest(BaseModel):
    """Everything the customer signup form collects.

    The `state` is what drives which plans this customer will be offered.
    """

    first_name: str = Field(min_length=1, max_length=80, examples=["Maria"])
    last_name: str = Field(min_length=1, max_length=80, examples=["Alvarez"])
    email: EmailStr = Field(examples=["maria.alvarez@example.com"])
    password: str = Field(min_length=8, max_length=128, examples=["Customer123!"])
    phone: str = Field(min_length=7, max_length=30, examples=["(305) 555-0142"])
    address: str = Field(min_length=3, max_length=255, examples=["1420 Palm Grove Ave"])
    city: str = Field(min_length=1, max_length=120, examples=["Miami"])
    state: str = Field(min_length=2, max_length=2, examples=["FL"])
    zip_code: str = Field(min_length=5, max_length=10, examples=["33132"])

    @field_validator("state")
    @classmethod
    def _validate_state(cls, value: str) -> str:
        return _normalise_state(value)

    @field_validator("password")
    @classmethod
    def _validate_password(cls, value: str) -> str:
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one letter and one number.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr = Field(examples=["admin@hvacdemo.com"])
    password: str = Field(min_length=1, examples=["Admin123!"])


class TokenResponse(BaseModel):
    """Returned by both login endpoints and by register."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserOut
