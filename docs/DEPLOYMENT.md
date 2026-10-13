# Deploying the maintenance workflow release

Production: EC2 `i-0fbca37ce8619e143` (ap-southeast-2, t3.micro), app directory
`/home/ubuntu/hvac-project/hvac-protection-platform`, MySQL on the host, Nginx
in front, images on GHCR, deploys by GitHub Actions (`.github/workflows/ci.yml`).

**Order matters:** server prep → (optional) Terraform → database backup →
migration → push / deploy → AWS wiring → verification. Every step below is
safe to repeat.

---

## 0. Architecture in one paragraph

MySQL holds all business data: users (now including `TECHNICIAN`), plans
(`max_ac_units`), purchases, `ac_units`, `service_requests` and `photos`
(metadata and S3 keys only). Photo bytes live in a private S3 bucket. Browsers
upload them with 5-minute presigned POSTs, the backend checks each file's
signature before accepting it, and photos are viewed through 5-minute
presigned GETs. Every service-request change writes an event to the MySQL
`activity_outbox` in the same transaction. A background worker in the backend
copies events to DynamoDB at least once, with retries, never overwriting an
existing event. History reads merge DynamoDB with any undelivered outbox rows.
The backend gets AWS credentials from the EC2 instance role; no keys exist
anywhere.

---

## 1. Prepare the server (once)

```bash
ssh ubuntu@<EC2_HOST>
cd /home/ubuntu/hvac-project/hvac-protection-platform

git status --short          # must be clean, or `git pull --ff-only` in CI will fail
docker compose version      # 2.24.0 or newer is required
free -m
grep -o '^[A-Z_]*=' .env backend/.env 2>/dev/null    # names only, never values
```

The root `.env` must define `DATABASE_URL`, `CORS_ORIGINS` and
**`JWT_SECRET_KEY`**. Before this release `JWT_SECRET_KEY` was never passed to
the container, so production either signed tokens with the public default key
or relied on a `backend/.env` copied into the image. The deploy script now
refuses to run without it:

```bash
# If backend/.env already has JWT_SECRET_KEY, keep using that value (copy it to .env)
# so existing sessions stay valid. Otherwise generate a new one; everyone signs in again.
python3 -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
chmod 600 .env backend/.env 2>/dev/null
```

---

## 2. Terraform (S3, DynamoDB, IAM): needs your explicit approval

Follow `terraform/README.md`. In short: bootstrap the state bucket, then
`terraform plan -out=tfplan`, review (**12 to add, 0 change, 0 destroy**),
`terraform apply tfplan`, and attach the instance profile with
`aws ec2 associate-iam-instance-profile`.

The app runs without this step: uploads return a clear 503 and history waits in
MySQL, so it can happen before or after the code deploy.

---

## 3. Back up the production database

```bash
# Read the database name/user from DATABASE_URL in .env (do not paste the URL anywhere).
mkdir -p ~/backups && chmod 700 ~/backups
STAMP=$(date +%F-%H%M)
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF \
  -u <db_user> -p <db_name> | gzip > ~/backups/<db_name>-$STAMP.sql.gz

# Verify the backup exists, is complete and readable:
ls -lh ~/backups/<db_name>-$STAMP.sql.gz
gunzip -t ~/backups/<db_name>-$STAMP.sql.gz && echo "archive OK"
zcat ~/backups/<db_name>-$STAMP.sql.gz | grep -c "CREATE TABLE"     # expect 6 (5 tables + alembic_version)
zcat ~/backups/<db_name>-$STAMP.sql.gz | tail -1                    # "-- Dump completed on ..."

# Keep a copy off the instance as well, e.g.:
# scp ubuntu@<EC2_HOST>:~/backups/<db_name>-$STAMP.sql.gz .
```

---

## 4. Push the code: the first deploy stops at the migration gate (expected)

Push to `main`. CI runs backend tests on SQLite and MySQL 8.0 (including
migration upgrade/check/downgrade/re-upgrade), frontend lint, type-check and
build, and Terraform fmt/validate. It then pushes images tagged `<sha>` and
`latest`. The deploy job logs in to GHCR with a job-scoped token, pulls the
images, and runs `alembic current` with the new image. The database is still
at `0001_initial`, so it stops with **"Back up and migrate first"**. Nothing
running is changed.

## 5. Migrate (after step 3), using the new image

```bash
cd /home/ubuntu/hvac-project/hvac-protection-platform
export IMAGE_TAG=<commit sha from the GitHub Actions run>

docker compose run --rm --no-deps backend alembic current     # expect 0001_initial
docker compose run --rm --no-deps backend alembic upgrade head
docker compose run --rm --no-deps backend alembic current     # expect 0002_maintenance_workflow (head)
```

What `0002_maintenance_workflow` does (additive only):
* `users.role` gains `TECHNICIAN` (appended to the ENUM, in-place, metadata-only).
* `plans.max_ac_units INT NOT NULL DEFAULT 1` (existing plans get 1).
* Creates `ac_units`, `service_requests`, `photos`, `activity_outbox`.

The **old application keeps working on the migrated schema**. It doesn't read
the new column or tables, so migrating before the deploy causes no downtime.
MySQL DDL is not transactional: if the command fails half-way, stop and restore
from the step 3 backup rather than retrying blindly.

Verified before release: upgrade from `0001` with existing rows on a disposable
**MySQL 8.0.46**, `alembic check` (models match the schema), the CHECK
constraint, the downgrade guard, and a downgrade/re-upgrade cycle.

## 6. Deploy

In GitHub → Actions → the failed run → **Re-run failed jobs** (or push again).
`deploy/deploy.sh` then runs `docker compose up -d`, waits for
`/api/health`, checks both frontends respond, and prints `docker compose ps`.

Manual equivalent on the server:

```bash
GHCR_USER=<github-user> GHCR_TOKEN=<PAT with read:packages> bash deploy/deploy.sh <sha>
```

## 7. Wire up AWS (after Terraform)

```bash
terraform -chdir=terraform output backend_env     # on your machine
# On the server, append those three lines to .env, then:
docker compose up -d backend
docker compose logs --tail=30 backend   # the "S3_BUCKET_NAME is not set" warnings must be gone
docker compose exec backend python -c "import boto3; print(boto3.client('sts').get_caller_identity()['Arn'])"
```

Add the exact browser origins of both apps to `CORS_ORIGINS` (API) and
`cors_allowed_origins` (Terraform, for S3 uploads).

## 8. Nginx

The live config is not in the repo. `deploy/nginx/hvac.conf.example` documents
what the apps need (`/api/` → `127.0.0.1:8000` on the server that serves the
customer app, and on port 80 of the IP the admin build points to). Compare it
before editing anything and always run `sudo nginx -t` before
`sudo systemctl reload nginx`.

Recommended later (not done automatically): publish 8000/3000/3001 on
`127.0.0.1` only, so everything goes through Nginx, after confirming nothing
reaches them directly. Keep MySQL bound to localhost and closed in the security
group.

---

## GitHub configuration

| Kind | Name | Notes |
|---|---|---|
| Secret | `EC2_HOST`, `EC2_SSH_KEY` | Already in use. |
| Variable (optional) | `CUSTOMER_NEXT_PUBLIC_API_URL`, `ADMIN_NEXT_PUBLIC_API_URL` | Baked into frontend builds. Unset keeps today's behaviour: customer uses relative `/api`, admin uses `http://54.206.86.229`. |
| Environment (optional) | `production` | Add required reviewers to approve each deploy manually. |

No AWS credentials are stored in GitHub. Terraform runs locally with the
`hvac-dev` profile. GHCR pulls use the job's own `GITHUB_TOKEN`.

---

## Verification checklist (use test accounts only)

- [ ] `curl -s http://127.0.0.1:8000/api/health` → `{"status":"ok",...}`; `/docs` loads.
- [ ] Existing customer can sign in, see plans, and see their purchase; existing admin signs in.
- [ ] Admin → Technicians: create a test technician. Technician signs in on the admin app and lands on `/technician`. The same login is refused on the customer site.
- [ ] Customer with an active plan: register an AC unit. A second unit is refused when `max_ac_units` = 1.
- [ ] Upload a JPEG on the unit page: progress bar, then the photo appears. Renaming a `.txt` to `.jpg` is rejected.
- [ ] S3 console: the object is under `customers/<id>/ac-units/<id>/initial/`. The bucket shows "Objects can be public: no"; opening the object URL without a signature gives `AccessDenied`.
- [ ] Submit a "Water leak" service request with a photo. Admin sees it under Service Requests with photos.
- [ ] Admin: Start review → Approve → Assign technician. Reject without a reason is refused.
- [ ] A second customer and an unassigned technician get "not found" for that request.
- [ ] Technician: Start inspection → findings → Start repair → upload AFTER photo → Complete. Complete without an AFTER photo is refused.
- [ ] Customer timeline shows the steps without staff notes. Admin history shows all events.
- [ ] DynamoDB console → `hvac-prod-service-activity` → query `request_id = <id>`: events in order. `SELECT COUNT(*) FROM activity_outbox WHERE delivered_at IS NULL;` → 0 after about 30 s.

---

## Rollback

**Application:**
```bash
IMAGE_TAG=<previous good sha> docker compose up -d
```
For the very first deploy of this release (older images were built on the
server and have no sha tag): `git checkout <previous commit> -- compose.yml`
restores the old build-based compose file, `docker images` lists the old
locally-built images, and `docker compose up -d` brings them back. Then restore
the file with `git checkout main -- compose.yml`.

**Database:** usually nothing to do. The migration is additive and the old
code runs on the new schema. A downgrade (`alembic downgrade 0001_initial`)
**deletes all AC units, service requests, photo metadata and outbox rows**, and
refuses while technician accounts exist. Prefer leaving the schema in place.
In a real emergency, restore the step 3 backup into a new database, verify it,
then point `DATABASE_URL` at it.

**AWS:** unset `S3_BUCKET_NAME`/`DYNAMODB_ACTIVITY_TABLE` and restart the
backend to disable the integrations. The bucket and table are
`prevent_destroy` and keep their data. Detach the role with
`aws ec2 disassociate-iam-instance-profile` if ever needed.

---

## Running the checks locally

```bash
# Backend (SQLite + mocked AWS; no credentials or database needed)
cd backend && pip install -r requirements-dev.txt && pytest
# Against a DISPOSABLE MySQL database (tables are dropped between tests):
TEST_DATABASE_URL="mysql+pymysql://root:@127.0.0.1:3407/hvac_pytest" pytest

# Frontends
cd customer-frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build
cd admin-frontend    && npm ci && npm run lint && npx tsc --noEmit && npm run build

# Terraform (static)
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false && terraform -chdir=terraform validate
```

## Known limitations

* Technicians have no self-service password change. Admins set the initial password.
* The outbox worker runs inside the single backend process (one uvicorn worker).
  `SKIP LOCKED` keeps it safe if replicas are added. Delivery is at-least-once;
  history may lag DynamoDB by up to about 30 s during an outage, but is never lost.
* There is no rate limiting beyond the per-category photo cap (10), the 10 MB size
  limit and 5-minute link expiry. Add Nginx `limit_req` if abuse appears.
* Photos document visible condition only. They do not establish internal
  condition or warranty eligibility.
