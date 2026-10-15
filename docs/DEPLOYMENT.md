# Deploying the maintenance workflow release

Production: EC2 `i-0fbca37ce8619e143` (ap-southeast-2, t3.micro), app directory
`/home/ubuntu/hvac-project/hvac-protection-platform`, MySQL on the host, Nginx
in front, images on GHCR, deploys by GitHub Actions (`.github/workflows/ci.yml`).

**Order:** server prep (once) → push. Each deploy backs up, migrates and
verifies the database automatically before switching containers (section 3). Every step below is
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

## 3. How every deploy handles the database (automatic)

Each push to `main` runs CI (tests on SQLite and MySQL 8.0, a migration
upgrade/downgrade cycle, a single-head check, shellcheck, a real `mysqldump`
backup test, frontend builds, Terraform checks), pushes images tagged `<sha>`
and `latest`, then runs `deploy/deploy.sh <sha>` on the server:

1. **Lock:** `flock ~/.hvac-deploy.lock`. A second deploy or migration on the
   server is refused, on top of the GitHub `concurrency` group.
2. **Pre-flight:** compose version, `mysqldump` and `python3` present,
   `.env` secrets present (checked by name only).
3. **Pull** the images for `<sha>`.
4. **`deploy/db-migrate.sh`**, using the backend image for `<sha>`:
   * `python migration_status.py` connects to the database and compares its
     revision with **this release's own migration head**. Nothing is
     hard-coded; several pending migrations are listed oldest first.
   * Stops (nothing changed) if the database can't be reached, if the
     release has more than one head, or if the database is at a revision this
     release doesn't know (e.g. migrated by a newer release). **It never
     downgrades and never uses `alembic stamp`.**
   * If migrations are pending, **creates and verifies a backup**
     (`deploy/backup-db.py`, see below), then runs `alembic upgrade head`.
     Alembic applies only the missing revisions, in order.
   * Re-reads the revision and **verifies it equals the head**.
   * If nothing is pending, it does nothing (no backup).
5. **Start containers** for `<sha>`, wait for `/api/health`, check both
   frontends, seed any missing catalog services, print `docker compose ps`.

Any failure in steps 1–4 aborts **before** containers are replaced. The old
release keeps running and the GitHub job fails with the reason. Example log:

```
==> Database migrations
    database connection: ok
    current revision:    0003_claims_scheduling
    expected head:       0004_service_marketplace   (from image 3f2c9e1...)
    pending migrations:  0004_service_marketplace
    creating backup before migrating...
    backup verified:     /home/ubuntu/hvac-backups/hvac_db-20261015-134909-before-0004_service_marketplace.sql.gz (48213 bytes, 12 tables)
    applying: 0004_service_marketplace
    applied: 0003_claims_scheduling -> 0004_service_marketplace, ...
    migration verified:  database is at 0004_service_marketplace (= expected head)
==> Starting containers
==> Waiting for backend health
backend healthy
```

### One-time setup on the server

```bash
command -v mysqldump || sudo apt-get install -y mysql-client   # usually already there with mysql-server
command -v flock python3                                       # both ship with Ubuntu
```

The backup connects with the credentials in the root `.env` `DATABASE_URL`
(`host.docker.internal` is mapped to `127.0.0.1`). If that MySQL user may only
log in from the Docker network, add `BACKUP_DB_HOST=<address>` to `.env`.
Test it once by hand:

```bash
cd /home/ubuntu/hvac-project/hvac-protection-platform
python3 deploy/backup-db.py manual-test     # prints BACKUP_FILE=..., BACKUP_SIZE=..., BACKUP_TABLES=...
```

### Rule for future migrations: expand first

Migrations run **while the previous release is still serving traffic**, and
an application rollback does not undo them. So every migration must keep the
previous release working: add tables/nullable columns/ENUM values at the end;
never drop or rename in the same release that stops using something. Remove
old columns in a later release. All migrations so far (0002–0004) follow this.

## 4. Backups: where, verification, retention, restore

* **Where:** `~/hvac-backups/<db>-<UTC timestamp>-before-<head>.sql.gz` on the
  EC2 host, mode 600, directory mode 700.
* **How:** `mysqldump --single-transaction --routines --triggers
  --no-tablespaces --set-gtid-purged=OFF`, consistent without locking InnoDB
  tables. The password goes through a temporary owner-only option file and is
  never on a command line or in a log.
* **Verified** before any migration: the file is non-empty, is valid gzip, and
  ends with mysqldump's `Dump completed` marker. Table count is logged.
* **Retention:** the newest 10 are kept (`BACKUP_KEEP=<n>` in `.env` to
  change). Copy important ones off the instance:
  `scp ubuntu@<EC2_HOST>:~/hvac-backups/<file> .`

**Restore (into a NEW database first, never over the live one):**

```bash
cd ~/hvac-backups
gunzip -t <file>.sql.gz && echo "archive OK"
mysql -u root -p -e "CREATE DATABASE hvac_restore CHARACTER SET utf8mb4;"
gunzip -c <file>.sql.gz | mysql -u root -p hvac_restore
mysql -u root -p hvac_restore -e "SELECT version_num FROM alembic_version; SELECT COUNT(*) FROM users;"
```

Only after checking the restored copy: stop the backend
(`docker compose stop backend`), switch `DATABASE_URL` in `.env` to the
restored database (or rename databases), deploy the image matching that
database's revision (`IMAGE_TAG=<sha> docker compose up -d`), and verify
health. Keep the original database until you are sure.

(Verified locally: a backup taken by this script restored into a fresh
MySQL 8.0.46 database with every row and the original revision.)

## 5. Fixing the current mismatch (production at 0003, code at 0004)

Nothing manual is needed beyond the one-time setup above. Push this change
(or re-run the failed workflow after pushing it). The deploy backs up,
applies `0004_service_marketplace`, verifies it and deploys.

To do it by hand instead, migrating without redeploying the frontends:

```bash
cd /home/ubuntu/hvac-project/hvac-protection-platform
git pull --ff-only origin main
export IMAGE_TAG=<sha of the commit you pushed>      # from the GitHub Actions run
echo "<github token with read:packages>" | docker login ghcr.io -u <github-user> --password-stdin
docker compose pull backend
bash deploy/db-migrate.sh        # lock -> status -> verified backup -> upgrade -> verify
```

What `0004_service_marketplace` does (reviewed: additive, no data removed):
* Creates eight new empty tables (catalog, plans, cart, orders, order items).
* `appointments.service_request_id` becomes nullable, and `appointments`
  gains `service_order_id`, a foreign key and a CHECK constraint. Adding a
  CHECK makes MySQL copy the `appointments` table, which is small, so the lock
  lasts well under a second at current sizes. Existing rows keep their values.
* Verified on a disposable MySQL 8.0.46 that mirrors production (`0003` with
  claims, an appointment and a password-protected app user), with the real
  backend image and `docker compose`: backup verified, upgrade applied,
  revision verified, all rows intact.

What `0002_maintenance_workflow` and `0003_claims_scheduling` do (additive):
* 0002: `users.role` gains `TECHNICIAN`; `plans.max_ac_units` (default 1);
  creates `ac_units`, `service_requests`, `photos`, `activity_outbox`.
* 0003: ENUM values appended; nullable plan coverage and request columns;
  creates `technician_profiles` and `appointments`.

## 6. If a migration or deploy fails

| What the log says | State | What to do |
|---|---|---|
| `another deploy is already running` | Nothing changed | Wait for it, then re-run. |
| `cannot connect to the database` | Nothing changed | Check MySQL (`sudo systemctl status mysql`) and `DATABASE_URL`; re-run. |
| `BACKUP FAILED: ...` | Nothing migrated, old containers running | Fix the cause shown (often `mysqldump` missing or the user's allowed host → `BACKUP_DB_HOST`); re-run. |
| `not part of this release's migration history` | Nothing changed | The database is newer than this code (a rollback to an old commit?). Deploy a release that contains that revision. **Do not stamp or downgrade.** |
| `more than one migration head` | Nothing changed | Two migrations share a parent: add an Alembic merge revision, push again. |
| `after upgrading the database is at X, expected Y` | Possibly **partly migrated**; old containers running | MySQL DDL is not transactional. Don't re-run blindly. Read the alembic error printed above it, check `SHOW CREATE TABLE` for the tables involved, fix the migration in a new commit, or restore the logged backup (section 4). |
| `Backend did not become healthy` | Schema migrated, new containers started | Roll back the **application only**: `IMAGE_TAG=<previous sha> docker compose up -d`. The schema stays (expand-first rule), and nothing is downgraded. |

### Verify revision and health at any time

```bash
cd /home/ubuntu/hvac-project/hvac-protection-platform
docker compose run --rm --no-deps -T backend python migration_status.py   # STATUS / CURRENT / HEAD / PENDING
docker compose ps
curl -fsS http://127.0.0.1:8000/api/health
ls -lh ~/hvac-backups | tail -5
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

**Database:** deploys never downgrade. Because migrations are additive
(expand first), the previous application release runs on the new schema, so an
application rollback needs no database change. A downgrade such as
`alembic downgrade 0001_initial` **deletes data** (AC units, claims, orders) and
the migrations refuse while such data exists. Don't use it in production. In a
real emergency restore a backup into a new database (section 4) and switch to
it after checking it.

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
