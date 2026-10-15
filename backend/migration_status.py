"""Report the database's Alembic revision against this code's migration graph.

    python migration_status.py

Run by deploy/db-migrate.sh inside the backend image being deployed, so the
expected head always comes from the release itself. Prints KEY=VALUE lines:

    STATUS=up_to_date | pending | multiple_heads | unknown_revision | db_error
    CURRENT=<revision or none>
    HEAD=<this code's single head>
    PENDING=<revisions still to apply, oldest first, space separated>

Exit code 0 for up_to_date/pending, 1 otherwise. Never prints the database URL.
"""

import sys

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings


def report(status: str, current: str = "", head: str = "", pending: list[str] | None = None) -> int:
    print(f"STATUS={status}")
    print(f"CURRENT={current or 'none'}")
    print(f"HEAD={head}")
    print(f"PENDING={' '.join(pending or [])}")
    return 0 if status in ("up_to_date", "pending") else 1


def main() -> int:
    script = ScriptDirectory.from_config(Config("alembic.ini"))
    heads = script.get_heads()
    if len(heads) != 1:
        print(f"ERROR=this release has {len(heads)} migration heads ({', '.join(heads)}); merge them first")
        return report("multiple_heads", head=",".join(heads))
    head = heads[0]

    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
        with engine.connect() as connection:
            current_heads = MigrationContext.configure(connection).get_current_heads()
    except SQLAlchemyError as exc:
        # Only the error class: the message can contain the host and user name.
        print(f"ERROR=cannot connect to the database ({type(exc).__name__})")
        return report("db_error", head=head)

    if len(current_heads) > 1:
        print("ERROR=the database records more than one revision")
        return report("unknown_revision", current=",".join(current_heads), head=head)
    current = current_heads[0] if current_heads else None

    if current is not None:
        try:
            script.get_revision(current)
        except CommandError:
            # e.g. the database was migrated by a NEWER release: never downgrade.
            print(f"ERROR=database revision {current} is not part of this release's migration history")
            return report("unknown_revision", current=current, head=head)

    if current == head:
        return report("up_to_date", current=current, head=head)

    # iterate_revisions walks head -> current; reverse to get apply order.
    pending = [rev.revision for rev in script.iterate_revisions(head, current or "base")]
    pending.reverse()
    return report("pending", current=current, head=head, pending=pending)


if __name__ == "__main__":
    sys.exit(main())
