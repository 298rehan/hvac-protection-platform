"""The `activity_outbox` table - transactional outbox for DynamoDB activity events.

An event row is written in the same MySQL transaction as the business change it
describes, so the two can never disagree. A background worker then copies it to
DynamoDB and marks it delivered. See `app.services.activity`.
"""

from datetime import datetime

from sqlalchemy import JSON, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.database.types import UTCDateTime, current_timestamp_6, utcnow


class ActivityOutbox(Base):
    __tablename__ = "activity_outbox"
    __table_args__ = (Index("ix_activity_outbox_pending", "delivered_at", "next_attempt_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    # No foreign key on purpose: the audit trail must outlive the request row.
    request_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # The exact DynamoDB item (all string attributes).
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Error class/code only - never a message that could contain credentials.
    last_error: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, server_default=current_timestamp_6(), nullable=False
    )
