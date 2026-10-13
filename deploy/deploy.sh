#!/usr/bin/env bash
# Deploy one commit's images on the EC2 host. Run by GitHub Actions over SSH
# after `git pull`, or by hand:
#
#   cd /home/ubuntu/hvac-project/hvac-protection-platform
#   GHCR_USER=<github-user> GHCR_TOKEN=<token with read:packages> bash deploy/deploy.sh <image-tag>
#
# Every check runs BEFORE anything changes, so a failed check leaves the running
# containers untouched. The script never migrates the database, never removes
# volumes and never runs `docker compose down`.
set -euo pipefail

IMAGE_TAG="${1:-latest}"
export IMAGE_TAG
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDEPLOY ABORTED: %s\n' "$*" >&2; exit 1; }

step "Pre-flight checks (image tag: ${IMAGE_TAG})"

# `env_file` with `required: false` needs Docker Compose 2.24 or newer.
compose_version="$(docker compose version --short 2>/dev/null || true)"
[ -n "$compose_version" ] || fail "docker compose plugin not found."
lowest="$(printf '%s\n2.24.0\n' "${compose_version#v}" | sort -V | head -n1)"
[ "$lowest" = "2.24.0" ] || fail "Docker Compose ${compose_version} is too old; 2.24.0+ is required."
echo "docker compose ${compose_version}"

# The backend must have a real JWT signing key (checked by name only - values
# are never printed).
has_var() { grep -qsE "^[[:space:]]*$1=.+" .env backend/.env; }
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

step "Checking database migrations (read-only)"
# Runs the NEW backend image once, without starting the service, to compare the
# database's Alembic revision with the code's head. It only reads the
# alembic_version table.
alembic() { docker compose run --rm --no-deps -T backend alembic "$@" 2>/dev/null; }
current="$(alembic current | awk 'NF {rev=$1} END {print rev}')"
head="$(alembic heads | awk 'NF {rev=$1} END {print rev}')"
echo "database revision: ${current:-<none>}   code head: ${head:-<unknown>}"
[ -n "$head" ] || fail "Could not read the Alembic head from the new image."
if [ "$current" != "$head" ]; then
  fail "The database is at '${current:-<none>}' but this release needs '${head}'.
Back up and migrate first (docs/DEPLOYMENT.md, 'Database migration'), then re-run the deploy.
The currently running containers have NOT been changed."
fi

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

step "Cleaning up dangling images"
docker image prune -f >/dev/null

docker compose ps
echo "Deployed ${IMAGE_TAG}"
