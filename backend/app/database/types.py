"""Portable column types.

MySQL's ``DATETIME`` has no time zone: whatever you write is what you read back,
with no offset stored. PostgreSQL's ``TIMESTAMPTZ`` normalised to UTC for us.

Since the API contract (and both frontends) rely on timestamps being unambiguous
UTC instants, ``UTCDateTime`` restores that behaviour on MySQL:

* on the way in  - any datetime is converted to UTC and stored naive
* on the way out - the value is handed back as a timezone-aware UTC datetime

Application code therefore keeps working with aware UTC datetimes exactly as it
did on PostgreSQL, and Pydantic keeps serialising them with a ``+00:00`` offset.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, TextClause, text
from sqlalchemy.dialects import mysql
from sqlalchemy.types import TypeDecorator

# Microsecond precision. MySQL DATETIME defaults to whole seconds, which would
# silently truncate created_at and make same-second ordering unstable.
MYSQL_FRACTIONAL_SECONDS = 6


class UTCDateTime(TypeDecorator):
    """A timestamp column that always reads and writes aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=MYSQL_FRACTIONAL_SECONDS))
        # Other backends (e.g. PostgreSQL) keep a real timezone-aware column.
        return dialect.type_descriptor(DateTime(timezone=True))

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        # A naive datetime reaching here is assumed to already be UTC.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        if dialect.name == "mysql":
            return value.replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    """Current time as an aware UTC datetime, used for column defaults.

    Applied Python-side so a row's timestamp never depends on the database
    server's local time zone.
    """
    return datetime.now(timezone.utc)


def current_timestamp_6() -> TextClause:
    """Server-side default matching a DATETIME(6) column.

    MySQL rejects `DEFAULT CURRENT_TIMESTAMP` on a column with fractional
    seconds - the precision of the default has to match the column's, so a plain
    `now()` would fail with "Invalid default value". Returns a fresh clause each
    call so it can be attached to more than one column.
    """
    return text("CURRENT_TIMESTAMP(6)")
