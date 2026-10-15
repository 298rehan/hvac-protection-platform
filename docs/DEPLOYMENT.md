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

### Where configuration comes from

| Setting | Where it lives | Who sets it |
|---|---|---|
| `AWS_REGION`, `S3_BUCKET_NAME`, `DYNAMODB_ACTIVITY_TABLE` | `deploy/production.env` (committed, not secret) | Arrives with every `git pull` |
| `JWT_SECRET_KEY` | server `.env` (git-ignored, mode 600) | Kept if present; otherwise **generated on the server** by `deploy/ensure-env.sh` during the deploy |
| `DATABASE_URL`, `CORS_ORIGINS` | server root `.env` | You (already there today). Never generated |
| AWS credentials | nowhere: the EC2 role `hvac-prod-backend-ec2` | Attach the role once (step 7) |

`compose.yml` loads `deploy/production.env` first, then `.env`, then
`backend/.env`; later files win. **Don't put an empty `S3_BUCKET_NAME=` line in
the server files**: it would override the committed value (the deploy prints a
warning if it finds one).

On every deploy `deploy/ensure-env.sh`:
* creates `.env` with owner-only permissions if it doesn't exist
* adds a random `JWT_SECRET_KEY` only if neither `.env` nor `backend/.env` has one
* never changes, reorders or prints existing values

**Sessions:** before this release `JWT_SECRET_KEY` was never passed to the
container. If the server had no key, production was signing tokens with the
public default key, and the generated key signs everyone out once (expected).
If `backend/.env` already contains a key, it is kept and nobody is signed out.

To check without printing values:
```bash
grep -o '^[A-Z_]*=' .env backend/.env 2>/dev/null
```

---

## 2. Terraform (S3, DynamoDB, IAM): needs your explicit approval

**Done (2026-10-14):** state bucket bootstrapped and the main stack applied
(12 added). Bucket `hvac-prod-media-594775505885-ap-southeast-2`, table
`hvac-prod-service-activity`, role/instance profile `hvac-prod-backend-ec2`.
The remaining step, attaching the role to the instance, is step 7.

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

docker compose run --rm --no-deps backend alembic current     # where the server is now
docker compose run --rm --no-deps backend alembic upgrade head # applies every pending migration (0002-0004)
docker compose run --rm --no-deps backend alembic current     # expect 0004_service_marketplace (head)
```

What `0002_maintenance_workflow` does (additive only):
* `users.role` gains `TECHNICIAN` (appended to the ENUM, in-place, metadata-only).
* `plans.max_ac_units INT NOT NULL DEFAULT 1` (existing plans get 1).
* Creates `ac_units`, `service_requests`, `photos`, `activity_outbox`.

What `0003_claims_scheduling` does (additive only):
* ENUM values appended: `ac_type` FURNACE; `service_type` SYSTEM_NOT_STARTING,
  THERMOSTAT_ISSUE; `service_requests.status` NEEDS_INFO, SCHEDULED.
* Nullable columns: `plans.covered_ac_types`, `plans.covered_service_types`
  (NULL = not restricted), `service_requests.preferred_windows`,
  `info_request_note`, `info_response_note`.
* Creates `technician_profiles` (service states, ZIP prefixes, specialties) and
  `appointments` (UTC start/end, property time zone, CONFIRMED/CANCELLED).
* Verified on a disposable MySQL 8.0.46: upgrade from 0002 with existing rows,
  `alembic check`, the downgrade guard, and a downgrade/re-upgrade cycle.

What `0004_service_marketplace` does (additive only):
* Creates `service_categories`, `hvac_services`, `service_addons`,
  `discount_codes`, `custom_plans`, `custom_plan_items`, `service_orders`,
  `service_order_items` (all money columns `DECIMAL(10,2)`).
* `appointments.service_request_id` becomes nullable and `appointments` gains
  `service_order_id` plus a CHECK that exactly one of them is set. Existing
  appointment rows are unchanged.
* Verified on a disposable MySQL 8.0.46 with an existing claim appointment:
  upgrade, `alembic check`, CHECK constraint, downgrade guard (refuses while
  orders exist), downgrade/re-upgrade.

The starter catalog is added by `python seed_catalog.py`, which the deploy
script runs after every deploy. It is insert-only by slug, so it never
duplicates services or overwrites admin price changes.

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

## 7. Attach the IAM role (once, needs your approval)

The AWS settings already arrive through `deploy/production.env`. The backend
only needs credentials, which come from the instance role. From your PC
(PowerShell):

```powershell
$env:AWS_PROFILE = "hvac-dev"
aws ec2 associate-iam-instance-profile --region ap-southeast-2 `
  --instance-id i-0fbca37ce8619e143 --iam-instance-profile Name=hvac-prod-backend-ec2
```

(Console alternative: EC2 → instance → Actions → Security → Modify IAM role.)
This does not reboot or replace the instance. The role was checked with the
IAM policy simulator: it allows photo put/get/delete under `customers/` and
`service-requests/`, `ListBucket` on those prefixes, and DynamoDB
`PutItem`/`Query` on the table. Everything else is denied.

Then on the server:
```bash
docker compose restart backend
docker compose logs --tail=30 backend   # no "S3_BUCKET_NAME is not set" warnings
docker compose exec backend python -c "import boto3; print(boto3.client('sts').get_caller_identity()['Arn'])"
# expect ...assumed-role/hvac-prod-backend-ec2/i-0fbca37ce8619e143
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

## Claims, technician matching and appointments

Claims are the existing `service_requests` records (shown as "Claims" in both
apps; URLs unchanged).

* **Eligibility:** an ACTIVE purchase (admin-confirmed) and an AC unit covered by
  it. Plan coverage rules `covered_ac_types` / `covered_service_types` are
  enforced when set; **they are NULL (not restricted) until the business defines
  them** in Admin → Plans.
* **Statuses:** Submitted → Under review → (More info required ↔ Under review) →
  Approved/Rejected → Assigned → Scheduled → Inspection → (Awaiting customer
  approval) → In progress → Completed; Cancelled where permitted. Each move is
  role-checked on the server (`SERVICE_REQUEST_TRANSITIONS` in `models/enums.py`).
* **Technician matching:** Admin → Technicians → set each technician's service
  states, optional ZIP prefixes and specialties. A claim's eligible technicians
  are the active ones whose states include the property state and, if they list
  ZIP prefixes, whose prefixes match the property ZIP. They are ranked by
  specialty match, then how many of the customer's preferred windows they are
  free in, then open jobs. **No technician is eligible until areas are set.**
* **Appointments:** the admin enters a time in the property's local time
  (`STATE_TIMEZONES` in `core/regions.py`); it is stored in UTC. Overlapping
  CONFIRMED visits for one technician are rejected with 409. Bookings lock the
  technician row and re-check with a locking read, which is proven by
  `tests/test_booking_race.py` on MySQL. The customer and technician get an
  email through the existing EMAIL_MODE settings (console/file/smtp).
* **Availability** means "no conflicting confirmed visit". Working hours,
  holidays and travel time are not modelled yet.

## Service marketplace and Custom Plan Builder

* **Catalog:** categories, services (FIXED, STARTING_AT = estimate, PER_UNIT),
  add-ons, allowed frequencies, state availability and discount codes, all
  managed in Admin → Services. Starter prices from `seed_catalog.py` are
  **illustrative demo prices**.
* **Pricing:** one server function (`services/pricing_service.py`) prices quotes,
  saved plans, the cart and checkout from database values. Checkout ignores any
  price sent by the browser and copies names and prices onto the order, so later
  catalog changes never alter existing orders. Tax and booking fee are applied
  only when `SERVICE_TAX_RATE` / `SERVICE_BOOKING_FEE` are set above 0.
* **Payment:** there is no payment gateway. Orders are **pay on service**:
  nothing is charged online. An admin records PAID only after the order is
  completed and every estimated price has been confirmed. Payment status is
  separate from order status.
* **Booking:** the customer requests a date and window. Checkout only accepts a
  window in which at least one technician serving the address has no confirmed
  visit. The admin then books the real appointment with the same conflict-safe
  logic as claims; claims and orders share one technician calendar.
* **Safety:** idempotency keys (unique per customer) stop double-clicks and
  retries from creating duplicate orders (tested concurrently on MySQL); the
  order and its lines are written in one transaction.
* **Order lifecycle:** Pending confirmation → Confirmed → Scheduled (technician
  booked) → In progress → Completed; Cancelled by the customer before booking,
  or by an admin before work starts.
* **Not included:** online card payments, automatic recurring billing or
  automatic scheduling of recurring visits (frequency is recorded per item),
  and email notifications for orders.

## Contact Us (serverless, separate from the backend)

```
/contact page -> API Gateway (POST /contact) -> Lambda hvac-prod-contact -> DynamoDB hvac-prod-contact-messages
                                                                         -> SES email to the owner
```

* **Code:** `lambda/contact/app.py` (tests: `lambda/contact/test_app.py`).
  Infrastructure: `terraform/contact-us.tf`. Terraform zips the code, and any
  change to `app.py` redeploys the function on the next `terraform apply`.
* **URL:** `terraform output contact_api_url`. It's baked into the customer
  build as `NEXT_PUBLIC_CONTACT_API_URL` (CI `build-args`, overridable with the
  repository variable `CONTACT_API_URL`). It's a public URL, not a secret.
* **CORS:** only the origins in `contact_allowed_origins` (terraform.tfvars).
  Throttled to 5 requests/s (burst 10).
* **Email:** SES is in sandbox mode, so the notification address is both
  sender and recipient and must be verified: open the "Amazon Web Services –
  Email Address Verification Request" email and click the link. Until then,
  messages are still saved and the Lambda logs `notification email failed:
  MessageRejected`. The customer's address is used as Reply-To, never as sender.
  Check status:
  `aws sesv2 get-email-identity --email-identity <address> --region ap-southeast-2`
* **Read messages:** DynamoDB console → `hvac-prod-contact-messages` → Explore items.
* **Logs:** CloudWatch → `/aws/lambda/hvac-prod-contact` (14-day retention).
* **Tests:** `python -m pytest lambda/contact` (moto, no AWS needed).

## Known limitations

* Technicians have no self-service password change. Admins set the initial password.
* The outbox worker runs inside the single backend process (one uvicorn worker).
  `SKIP LOCKED` keeps it safe if replicas are added. Delivery is at-least-once;
  history may lag DynamoDB by up to about 30 s during an outage, but is never lost.
* There is no rate limiting beyond the per-category photo cap (10), the 10 MB size
  limit and 5-minute link expiry. Add Nginx `limit_req` if abuse appears.
* Photos document visible condition only. They do not establish internal
  condition or warranty eligibility.
