#!/usr/bin/env python3
"""Create and verify a compressed MySQL backup on the EC2 host (stdlib only).

    python3 deploy/backup-db.py <label>

* Reads DATABASE_URL from the root .env (never sources the file, never prints it).
* The password goes into a temporary owner-only option file, so it never
  appears in `ps`, the command line or the logs.
* host.docker.internal (how containers reach the host) is mapped to 127.0.0.1.
  Set BACKUP_DB_HOST in .env if the database user can only log in from a
  specific address.
* Verifies the backup: non-empty, valid gzip, and ends with mysqldump's
  "Dump completed" marker. Keeps the newest BACKUP_KEEP (default 10) backups.

Prints the backup path on success; exits non-zero on any failure.
"""

import gzip
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", Path.home() / "hvac-backups"))


def fail(message: str) -> None:
    print(f"BACKUP FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def read_env(name: str) -> str | None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> None:
    label = (sys.argv[1] if len(sys.argv) > 1 else "manual").replace("/", "-")[:40]
    mysqldump = shutil.which("mysqldump")
    if not mysqldump:
        fail("mysqldump is not installed on this host (sudo apt-get install -y mysql-client).")

    url = read_env("DATABASE_URL")
    if not url:
        fail("DATABASE_URL is not set in the root .env.")
    parts = urlsplit(url.replace("mysql+pymysql://", "mysql://", 1))
    database = parts.path.lstrip("/")
    if parts.scheme != "mysql" or not database or not parts.username:
        fail("DATABASE_URL is not a MySQL URL with a user and database name.")
    host = read_env("BACKUP_DB_HOST") or parts.hostname or "127.0.0.1"
    if host == "host.docker.internal":
        host = "127.0.0.1"

    BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = BACKUP_DIR / f"{database}-{stamp}-{label}.sql.gz"

    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False, encoding="utf-8") as options:
        os.chmod(options.name, 0o600)
        password = unquote(parts.password or "").replace("\\", "\\\\").replace('"', '\\"')
        options.write(
            "[client]\n"
            f"user=\"{unquote(parts.username)}\"\n"
            f"password=\"{password}\"\n"
            f"host={host}\n"
            f"port={parts.port or 3306}\n"
        )
    try:
        command = [
            mysqldump, f"--defaults-extra-file={options.name}",
            "--single-transaction",  # consistent snapshot without locking InnoDB tables
            "--routines", "--triggers",
            "--no-tablespaces",  # avoids needing the PROCESS privilege on MySQL 8
            "--set-gtid-purged=OFF",
            database,
        ]
        with gzip.open(target, "wb") as out:
            dump = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            shutil.copyfileobj(dump.stdout, out)
            _, err = dump.communicate()
        if dump.returncode != 0:
            target.unlink(missing_ok=True)
            # mysqldump's own message (no credentials in it) helps diagnose access problems.
            fail(f"mysqldump exited with {dump.returncode}: {err.decode(errors='replace').strip()[:300]}")
    finally:
        os.unlink(options.name)

    os.chmod(target, 0o600)
    size = target.stat().st_size
    if size == 0:
        fail(f"{target} is empty.")
    try:
        with gzip.open(target, "rt", encoding="utf-8", errors="replace") as check:
            last_line = ""
            tables = 0
            for line in check:
                if line.startswith("CREATE TABLE"):
                    tables += 1
                if line.strip():
                    last_line = line
    except OSError as exc:
        fail(f"{target} is not a valid gzip file ({exc}).")
    if "Dump completed" not in last_line:
        fail(f"{target} is incomplete (no 'Dump completed' marker).")

    keep = int(read_env("BACKUP_KEEP") or 10)
    backups = sorted(BACKUP_DIR.glob(f"{database}-*.sql.gz"))
    for old in backups[:-keep]:
        old.unlink()

    print(f"BACKUP_FILE={target}")
    print(f"BACKUP_SIZE={size}")
    print(f"BACKUP_TABLES={tables}")


if __name__ == "__main__":
    main()
