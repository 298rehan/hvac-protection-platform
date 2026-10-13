"""SQLAlchemy engine, session factory and the FastAPI database dependency.

Backend: MySQL 8 over the PyMySQL driver (``mysql+pymysql://``).
"""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# MySQL drops idle connections after `wait_timeout` (8 hours by default) and
# the pooled connection would otherwise come back dead. pool_pre_ping checks
# liveness before handing a connection out; pool_recycle retires connections
# well before the server would close them. SQLite (used only by the test suite)
# has its own pool that rejects these sizing options.
_pool_options = (
    {}
    if settings.database_url.startswith("sqlite")
    else {"pool_recycle": 3600, "pool_size": 5, "max_overflow": 10}
)
engine = create_engine(settings.database_url, pool_pre_ping=True, **_pool_options)


@event.listens_for(engine, "connect")
def _set_session_timezone(dbapi_connection, connection_record) -> None:
    """Pin every MySQL connection to UTC.

    MySQL's CURRENT_TIMESTAMP follows the session time zone, which defaults to
    the server's local zone. Our columns store UTC (see `UTCDateTime`), so the
    server-side defaults on created_at must be UTC too.
    """
    if engine.dialect.name != "mysql":
        return
    with dbapi_connection.cursor() as cursor:
        cursor.execute("SET time_zone = '+00:00'")


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped session and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
