"""Small shared schema helpers."""

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Base for schemas read straight out of SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    """Shape of every error body returned by the API."""

    detail: str
