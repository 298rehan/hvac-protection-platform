#!/usr/bin/env bash
# Deploy one commit's images on the EC2 host. Run by GitHub Actions over SSH
# after `git pull`, or by hand:
#
#   cd /home/ubuntu/hvac-project/hvac-protection-platform
#   GHCR_USER=<github-user> GHCR_TOKEN=<token with read:packages> bash deploy/deploy.sh <image-tag>
#
# Order: lock -> pre-flight -> pull -> backup + migrate + verify (deploy/db-migrate.sh)
# -> start containers -> health checks. Any failure before "Starting containers"
# leaves the running containers untouched. The script never downgrades or
# resets the database, never removes volumes and never runs `docker compose down`.
set -euo pipefail

IMAGE_TAG="${1:-latest}"
export IMAGE_TAG
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDEPLOY ABORTED: %s\n' "$*" >&2; exit 1; }

# One deploy (and so one migration) at a time on this server, even if two
# workflow runs or a manual run overlap.
exec 9>"${DEPLOY_LOCK_FILE:-$HOME/.hvac-deploy.lock}"
flock -n 9 || fail "another deploy is already running on this server."
export DEPLOY_LOCK_HELD=1

step "Pre-flight checks (image tag: ${IMAGE_TAG})"
command -v mysqldump >/dev/null || fail "mysqldump is not installed on this host (sudo apt-get install -y mysql-client). Nothing was changed."
command -v python3 >/dev/null || fail "python3 is required on this host for database backups. Nothing was changed."

# `env_file` with `required: false` needs Docker Compose 2.24 or newer.
compose_version="$(docker compose version --short 2>/dev/null || true)"
[ -n "$compose_version" ] || fail "docker compose plugin not found."
lowest="$(printf '%s\n2.24.0\n' "${compose_version#v}" | sort -V | head -n1)"
[ "$lowest" = "2.24.0" ] || fail "Docker Compose ${compose_version} is too old; 2.24.0+ is required."
echo "docker compose ${compose_version}"

# Create .env if missing and add a JWT signing key if none exists. Existing
# values are never changed and secrets are never printed.
step "Server environment file"
bash deploy/ensure-env.sh

# Checked by name only - values are never printed.
has_var() { grep -qsE "^[[:space:]]*$1=.+" .env backend/.env deploy/production.env; }
has_var JWT_SECRET_KEY || fail "JWT_SECRET_KEY is not set in .env or backend/.env (see docs/DEPLOYMENT.md)."
# compose.yml interpolates ${DATABASE_URL} and ${CORS_ORIGINS} from the ROOT
# .env; a value only in backend/.env would be overridden with an empty string.
for required in DATABASE_URL CORS_ORIGINS; do
  grep -qsE "^[[:space:]]*${required}=.+" .env || fail "${required} must be set in the root .env file."
done
for optional in S3_BUCKET_NAME DYNAMODB_ACTIVITY_TABLE; do
  has_var "$optional" || echo "WARNING: ${optional} not set - the related feature stays disabled."
done

step "Logging in to GHCR"
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
else
  echo "GHCR_TOKEN not provided - relying on existing docker credentials."
fi

step "Pulling images"
docker compose pull

step "Database migrations"
# Uses the NEW backend image: reads its migration head, backs up (only when
# something is pending), upgrades and verifies. Fails before any container
# is replaced.
bash deploy/db-migrate.sh || fail "database step failed (see above). The running containers have NOT been changed."

step "Starting containers"
docker compose up -d

step "Waiting for backend health"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health >/dev/null; then
    echo "backend healthy"
    break
  fi
  [ "$attempt" -eq 30 ] && {
    docker compose ps
    docker compose logs --tail=80 backend
    fail "Backend did not become healthy. Roll back with: IMAGE_TAG=<previous-sha> docker compose up -d"
  }
  sleep 3
done

for port in 3000 3001; do
  curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${port}/" \
    && echo "frontend on :${port} responding" \
    || echo "WARNING: frontend on :${port} did not respond yet"
done

step "Adding any missing starter catalog services"
# Insert-only and keyed by slug: existing services and admin price edits are
# never changed, so this is safe on every deploy.
docker compose exec -T backend python seed_catalog.py \
  || echo "WARNING: catalog seed failed - the app is running; retry with: docker compose exec backend python seed_catalog.py"

step "Cleaning up dangling images"
docker image prune -f >/dev/null

docker compose ps

step "Deploy summary"
echo "    image tag:            ${IMAGE_TAG}"
echo "    database:             migrated/verified (see 'Database migrations' above)"
echo "    containers deployed:  yes"
echo "    backend health:       passed"
echo "Deployed ${IMAGE_TAG}"
