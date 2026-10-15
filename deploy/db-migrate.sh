#!/usr/bin/env bash
# Bring the production database up to the migration head of the release being
# deployed: check -> verified backup -> alembic upgrade -> verify.
#
# Called by deploy/deploy.sh (which holds the deploy lock), or by hand:
#
#   cd /home/ubuntu/hvac-project/hvac-protection-platform
#   IMAGE_TAG=<commit sha> bash deploy/db-migrate.sh
#
# * Uses the backend image for IMAGE_TAG, so the migrations and the expected
#   head come from exactly the code being deployed (nothing is hard-coded).
# * Applies pending migrations in order with `alembic upgrade head`; already
#   applied ones are skipped by Alembic.
# * Never downgrades, never stamps, never drops anything. Refuses when the
#   database is at a revision this release does not know (e.g. a newer one).
# * Never prints credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${IMAGE_TAG:?IMAGE_TAG must be set to the image tag being deployed}"
export IMAGE_TAG

say() { printf '    %s\n' "$*"; }
fail() { printf '\nMIGRATION ABORTED: %s\n' "$*" >&2; exit 1; }

# Standalone runs take the same lock deploy.sh uses.
if [ -z "${DEPLOY_LOCK_HELD:-}" ]; then
  exec 9>"${DEPLOY_LOCK_FILE:-$HOME/.hvac-deploy.lock}"
  flock -n 9 || fail "another deploy or migration is running (lock: ${DEPLOY_LOCK_FILE:-$HOME/.hvac-deploy.lock})."
fi

backend_run() { docker compose run --rm --no-deps -T backend "$@"; }

read_status() {
  local output
  output="$(backend_run python migration_status.py 2>&1)" || true
  STATUS="$(printf '%s\n' "$output" | sed -n 's/^STATUS=//p' | tail -n1)"
  CURRENT="$(printf '%s\n' "$output" | sed -n 's/^CURRENT=//p' | tail -n1)"
  HEAD="$(printf '%s\n' "$output" | sed -n 's/^HEAD=//p' | tail -n1)"
  PENDING="$(printf '%s\n' "$output" | sed -n 's/^PENDING=//p' | tail -n1)"
  ERROR="$(printf '%s\n' "$output" | sed -n 's/^ERROR=//p' | tail -n1)"
}

read_status
[ "$STATUS" = db_error ] && CURRENT="unknown (no connection)"
say "database connection: $([ "$STATUS" = db_error ] && echo FAILED || echo ok)"
say "current revision:    ${CURRENT:-unknown}"
say "expected head:       ${HEAD:-unknown}   (from image ${IMAGE_TAG})"

case "$STATUS" in
  up_to_date)
    say "pending migrations:  none - database already matches this release"
    exit 0 ;;
  pending)
    say "pending migrations:  ${PENDING}" ;;
  *)
    fail "${ERROR:-could not read the migration status (${STATUS:-no output})}. Nothing was changed." ;;
esac

echo
say "creating backup before migrating..."
backup_output="$(python3 deploy/backup-db.py "before-${HEAD}")" \
  || fail "backup failed (see the message above). Nothing was migrated; running containers are unchanged."
BACKUP_FILE="$(printf '%s\n' "$backup_output" | sed -n 's/^BACKUP_FILE=//p')"
say "backup verified:     ${BACKUP_FILE} ($(printf '%s\n' "$backup_output" | sed -n 's/^BACKUP_SIZE=//p') bytes, $(printf '%s\n' "$backup_output" | sed -n 's/^BACKUP_TABLES=//p') tables)"

echo
say "applying: ${PENDING}"
upgrade_log="$(mktemp)"
trap 'rm -f "$upgrade_log"' EXIT
if backend_run alembic upgrade head >"$upgrade_log" 2>&1; then
  grep -E "Running upgrade" "$upgrade_log" | sed 's/.*Running upgrade/    applied:/' || true
else
  say "alembic upgrade FAILED. Last lines of its output:"
  # Drop any line that could contain a connection URL.
  grep -v "mysql+pymysql://" "$upgrade_log" | tail -n 25 | sed 's/^/      /'
fi

read_status
if [ "$STATUS" != "up_to_date" ]; then
  fail "after upgrading the database is at '${CURRENT:-unknown}', expected '${HEAD}'.
MySQL DDL is not transactional, so a failed migration can be partly applied.
Do NOT re-run blindly. Running containers are unchanged. Backup: ${BACKUP_FILE}
See docs/DEPLOYMENT.md -> 'If a migration fails'."
fi
say "migration verified:  database is at ${CURRENT} (= expected head)"
