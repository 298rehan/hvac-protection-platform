# HVAC Protection Plan Management System

A full-stack demonstration of a regional HVAC protection-plan business: a customer
website where homeowners compare and enroll in maintenance plans priced for their US
state, a separate admin panel for managing plans, pricing and enrollments, and a Python
API behind both.

Everything runs locally. There is no cloud service, container, or payment gateway
anywhere in the project.

> **Demonstration project.** "Summit Air" is a fictional company. All plans, prices,
> customers and purchases are sample data. Checkout is simulated: no payment gateway is
> contacted and no card details are ever collected or stored.

---

## Table of contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Folder structure](#folder-structure)
5. [Requirements](#requirements)
6. [Setup](#setup)
   - [1. MySQL database](#1-mysql-database)
   - [2. Backend](#2-backend)
   - [3. Database migrations](#3-database-migrations)
   - [4. Seed data](#4-seed-data)
   - [5. Customer frontend](#5-customer-frontend)
   - [6. Admin frontend](#6-admin-frontend)
7. [Running all three applications](#running-all-three-applications)
8. [Demo credentials](#demo-credentials)
9. [Email configuration](#email-configuration)
10. [API documentation](#api-documentation)
11. [Data model](#data-model)
12. [Business rules](#business-rules)
13. [Security notes](#security-notes)
14. [Try it out](#try-it-out)
15. [Troubleshooting](#troubleshooting)

---

## Overview

The business sells HVAC maintenance and protection plans. Because service and operating
costs differ between states, **the same plan can cost a different amount in different
regions**, and a plan can be offered in some states but not others.

That single idea drives most of the system:

- A customer registers with a service address. Their **state** decides which plans they
  see and what those plans cost.
- An admin creates a plan, assigns it to a set of states, and sets the price for each
  state. The customer site picks the change up immediately, with no frontend change.
- A customer enrolls through a simulated checkout. The purchase is created as `PENDING`.
- The admin approves it and the status becomes `ACTIVE`, which records the coverage dates
  and emails the customer.

### Feature summary

**Customer site**

- Home, Plans, Plan Details, Login, Register, Checkout
- Dashboard, My Plan, My Purchases, Profile
- Region picker for visitors; signed-in customers are always priced for their own state

**Admin panel** (a completely separate Next.js app on its own port)

- Dashboard: customers, plans, active/pending/cancelled counts and revenue
- Customer management: search, detail, purchase history, current plan
- Plan management: create, edit, activate/deactivate, delete, features, regional pricing
- Purchase management: filter by status, search, approve, cancel

**Backend**

- JWT authentication with bcrypt password hashing and role-based authorization
- Separate customer and admin login endpoints
- Regional plan pricing and availability
- Purchase lifecycle with a validated status machine and a full audit trail
- HTML email notifications with three delivery modes

---

## Architecture

```
┌─────────────────────────┐        ┌─────────────────────────┐
│   CUSTOMER FRONTEND     │        │    ADMIN FRONTEND       │
│   Next.js + TypeScript  │        │   Next.js + TypeScript  │
│   localhost:3000        │        │   localhost:3001        │
└───────────┬─────────────┘        └───────────┬─────────────┘
            │                                   │
            │            REST API (JSON + JWT)   │
            └─────────────────┬─────────────────┘
                              ▼
                 ┌─────────────────────────┐
                 │   PYTHON FASTAPI API    │
                 │   localhost:8000        │
                 │  routers → services →   │
                 │  models (SQLAlchemy)    │
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │       MySQL 8.0         │
                 │        hvac_db          │
                 └─────────────────────────┘
```

The backend is layered so business rules live in one place:

| Layer      | Responsibility                                                       |
| ---------- | -------------------------------------------------------------------- |
| `routers/` | HTTP shape: paths, status codes, auth dependencies, response models   |
| `services/`| Business rules: pricing, eligibility, status transitions, aggregates  |
| `schemas/` | Pydantic request/response validation                                  |
| `models/`  | SQLAlchemy ORM tables and relationships                               |
| `core/`    | Settings, security primitives, auth dependencies, region reference data |

---

## Tech stack

| Area           | Technology                                                |
| -------------- | --------------------------------------------------------- |
| Frontends      | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| Backend        | Python 3.12+, FastAPI, SQLAlchemy 2.0, Pydantic v2         |
| Database       | MySQL 8.0 (InnoDB / utf8mb4), Alembic migrations           |
| Auth           | PyJWT (HS256), bcrypt password hashing                     |
| Email          | Python `smtplib` + Jinja2 HTML templates                   |
| DB driver      | PyMySQL                                                    |

---

## Folder structure

```
HVAC_Full_Stack_Project/
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app, CORS, error handlers
│   │   ├── core/
│   │   │   ├── config.py           Settings loaded from .env
│   │   │   ├── security.py         Password hashing + JWT
│   │   │   ├── deps.py             Auth dependencies and role guards
│   │   │   └── regions.py          US state reference data
│   │   ├── database/
│   │   │   ├── session.py          Engine, session factory, Base
│   │   │   └── types.py            UTCDateTime - portable timestamp column
│   │   ├── models/                 users, plans, plan_regions, purchases, history
│   │   ├── schemas/                Pydantic request/response models
│   │   ├── routers/                auth, plans, purchases, customers, dashboard, regions
│   │   └── services/
│   │       ├── plan_service.py     Pricing, availability, plan CRUD rules
│   │       ├── purchase_service.py Checkout rules and status machine
│   │       ├── dashboard_service.py Aggregate queries
│   │       ├── email.py            SMTP / file / console delivery
│   │       ├── notifications.py    The five notification emails
│   │       └── email_templates/    Jinja2 HTML email templates
│   ├── alembic/                    Migration environment and versions
│   ├── seed.py                     Demo data seeder
│   ├── requirements.txt
│   └── .env.example
│
├── customer-frontend/              Next.js app on port 3000
│   ├── app/                        Routes (App Router)
│   ├── components/                 UI, header, footer, plan cards, forms
│   ├── lib/                        API client, auth context, formatting, region hook
│   ├── services/                   Typed API calls
│   ├── types/                      Shared response types
│   └── .env.example
│
├── admin-frontend/                 Next.js app on port 3001
│   ├── app/                        Dashboard, customers, plans, purchases, login
│   ├── components/                 Admin shell, tables, plan form
│   ├── lib/                        API client, auth context, formatting
│   ├── services/                   Typed API calls
│   ├── types/
│   └── .env.example
│
└── README.md
```

---

## Requirements

- **Python 3.12 or newer** (developed and verified on 3.14)
- **Node.js 20 or newer** (developed and verified on 24)
- **MySQL 8.0 or newer** (developed and verified on 8.0.46)

Check what you have:

```bash
python --version
node --version
mysql --version
```

On Windows, `mysql` is usually **not** on your `PATH`. It lives at
`C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe` - either call it with that
full path (quoted), or add that `bin` folder to your PATH.

---

## Setup

All commands below are run from the project root unless noted otherwise.

### 1. MySQL database

**Install MySQL** (skip if you already have it). Download the *MySQL Installer for
Windows* from https://dev.mysql.com/downloads/installer/ and pick the **Server only**
or **Developer Default** setup. During configuration:

- keep the default port **3306**
- keep **Use Strong Password Encryption** (the default)
- set a root password and remember it - you need it in step 2
- leave **Configure MySQL Server as a Windows Service** ticked so it starts with Windows

**Start MySQL** (PowerShell). The installer normally starts it for you:

```powershell
Get-Service MySQL80        # Status should be "Running"
Start-Service MySQL80      # ...if it is not
```

**Open the MySQL shell:**

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

Enter your root password, then **create the database**:

```sql
CREATE DATABASE hvac_db;
exit;
```

Or without opening the shell at all:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p -e "CREATE DATABASE hvac_db;"
```

Nothing else needs creating by hand - Alembic builds every table, index and foreign
key in step 4.

### 2. Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Windows (Git Bash)
source .venv/Scripts/activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create your environment file:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env
# macOS / Linux / Git Bash
cp .env.example .env
```

Open `backend/.env` and set at minimum:

```ini
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/hvac_db?charset=utf8mb4
JWT_SECRET_KEY=<paste a long random string>
```

Generate a secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Full list of backend variables:

| Variable                      | Purpose                                              | Default              |
| ----------------------------- | ---------------------------------------------------- | -------------------- |
| `DATABASE_URL`                | MySQL connection string (PyMySQL driver)             | local `hvac_db`      |
| `JWT_SECRET_KEY`              | Signing key for access tokens — **change this**      | insecure placeholder |
| `JWT_ALGORITHM`               | JWT algorithm                                        | `HS256`              |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime                                       | `720`                |
| `CORS_ORIGINS`                | Comma-separated allowed browser origins              | ports 3000 and 3001  |
| `EMAIL_MODE`                  | `console`, `file` or `smtp`                          | `console`            |
| `EMAIL_OUTPUT_DIR`            | Where `file` mode writes messages                    | `sent_emails`        |
| `SMTP_HOST` … `SMTP_PASSWORD` | SMTP server settings (only used when mode is `smtp`) | empty                |
| `EMAIL_FROM`                  | From address                                         | `no-reply@hvacdemo.com` |
| `EMAIL_FROM_NAME`             | From display name                                    | `Summit Air Protection Plans` |
| `ADMIN_NOTIFICATION_EMAIL`    | Where internal alerts are sent                       | `admin@hvacdemo.com` |
| `CUSTOMER_APP_URL`            | Used to build links inside emails                    | `http://localhost:3000` |
| `ADMIN_APP_URL`               | Used to build links inside emails                    | `http://localhost:3001` |

### 3. Database migrations

From `backend/`, with the virtual environment active:

```bash
alembic upgrade head
```

This creates `users`, `plans`, `plan_regions`, `purchases` and
`purchase_status_history` along with their enum types, indexes and foreign keys.

Useful follow-ups:

```bash
alembic current                              # which migration is applied
alembic downgrade -1                         # roll back one migration
alembic revision --autogenerate -m "message" # after changing a model
```

### 4. Seed data

```bash
python seed.py
```

This creates one admin, three customers, three plans with pricing in four states, and
four purchases covering every status. It refuses to run against a non-empty database; to
wipe and start over:

```bash
python seed.py --reset
```

### 5. Customer frontend

```bash
cd customer-frontend
npm install
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
```

`customer-frontend/.env.local` needs only:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 6. Admin frontend

```bash
cd admin-frontend
npm install
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
```

Same single variable:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Running all three applications

Open **three terminals**.

**Terminal 1 — backend (port 8000)**

```bash
cd backend
source .venv/Scripts/activate      # or .venv\Scripts\Activate.ps1 / .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — customer site (port 3000)**

```bash
cd customer-frontend
npm run dev
```

**Terminal 3 — admin panel (port 3001)**

```bash
cd admin-frontend
npm run dev
```

| Application    | URL                            |
| -------------- | ------------------------------ |
| Customer site  | http://localhost:3000          |
| Admin panel    | http://localhost:3001          |
| API            | http://localhost:8000          |
| Swagger docs   | http://localhost:8000/docs     |
| ReDoc          | http://localhost:8000/redoc    |

The ports are pinned in each app's `package.json` (`next dev --port 3000` / `3001`), so
there are no conflicts.

---

## Demo credentials

> These are **public demo credentials for local development only**. Never reuse them.

**Administrator** — sign in at http://localhost:3001

| Email                | Password    |
| -------------------- | ----------- |
| `admin@hvacdemo.com` | `Admin123!` |

**Customers** — sign in at http://localhost:3000/login

| Email                         | Password       | Region       | Seeded state                     |
| ----------------------------- | -------------- | ------------ | -------------------------------- |
| `maria.alvarez@example.com`   | `Customer123!` | Florida      | One ACTIVE plan, one EXPIRED     |
| `james.holloway@example.com`  | `Customer123!` | Texas        | One PENDING plan awaiting review |
| `priya.raman@example.com`     | `Customer123!` | Arizona      | One CANCELLED plan               |

Customers cannot sign in to the admin panel, and the admin cannot sign in to the
customer site — each login endpoint rejects the other role with a `403`.

---

## Email configuration

The system sends five notifications:

| Trigger                     | To       | Template                  |
| --------------------------- | -------- | ------------------------- |
| Registration succeeds       | Customer | `welcome.html`            |
| Plan purchase submitted     | Customer | `purchase_submitted.html` |
| Plan becomes active         | Customer | `purchase_active.html`    |
| New customer registers      | Admin    | `admin_new_customer.html` |
| New plan purchase created   | Admin    | `admin_new_purchase.html` |

Delivery is controlled by `EMAIL_MODE` in `backend/.env`:

**`console`** (default) — nothing to configure. Each message is logged in the backend
terminal. Good for a first run.

**`file`** — messages are written as `.html` files you can open in a browser:

```ini
EMAIL_MODE=file
EMAIL_OUTPUT_DIR=sent_emails
```

**`smtp`** — real delivery. Example using Gmail with an
[app password](https://support.google.com/accounts/answer/185833):

```ini
EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
SMTP_USE_SSL=false
EMAIL_FROM=you@gmail.com
```

Or a local capture server such as [MailHog](https://github.com/mailhog/MailHog):

```ini
EMAIL_MODE=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USE_TLS=false
```

Emails are sent in a FastAPI background task, so a slow or broken mail server never
blocks or fails a request — failures are logged and the API responds normally.

---

## API documentation

FastAPI generates interactive docs at **http://localhost:8000/docs**.

To call a protected endpoint from Swagger: run `POST /api/auth/login` (or
`/api/auth/admin/login`), copy the `access_token` from the response, click
**Authorize**, and paste it.

### Endpoints

**Authentication**

| Method | Path                    | Access | Description                              |
| ------ | ----------------------- | ------ | ---------------------------------------- |
| POST   | `/api/auth/register`    | Public | Register a customer, returns a token     |
| POST   | `/api/auth/login`       | Public | Customer sign in (rejects admins)        |
| POST   | `/api/auth/admin/login` | Public | Admin sign in (rejects customers)        |
| GET    | `/api/auth/me`          | Any    | The signed-in user                       |

**Plans**

| Method | Path                     | Access   | Description                                |
| ------ | ------------------------ | -------- | ------------------------------------------ |
| GET    | `/api/plans?state=FL`    | Public   | Active plans sold in a state, priced for it |
| GET    | `/api/plans/mine`        | Customer | Plans available where the customer lives    |
| GET    | `/api/plans/{id}?state=` | Public   | One plan priced for a state                 |
| GET    | `/api/plans/admin/all`   | Admin    | Every plan including inactive, full pricing |
| GET    | `/api/plans/{id}/admin`  | Admin    | Full plan record                            |
| POST   | `/api/plans`             | Admin    | Create a plan with regional pricing         |
| PUT    | `/api/plans/{id}`        | Admin    | Update a plan; `regions` replaces pricing   |
| DELETE | `/api/plans/{id}`        | Admin    | Delete (409 if any purchase references it)  |

**Purchases**

| Method | Path                           | Access   | Description                          |
| ------ | ------------------------------ | -------- | ------------------------------------ |
| POST   | `/api/purchases`               | Customer | Demo checkout, creates `PENDING`     |
| GET    | `/api/purchases/me`            | Customer | The signed-in customer's purchases   |
| GET    | `/api/purchases`               | Admin    | All purchases, filter and search     |
| GET    | `/api/purchases/{id}`          | Owner/Admin | Detail with status history        |
| PATCH  | `/api/purchases/{id}/status`   | Admin    | Approve, cancel or expire            |

**Customers**

| Method | Path                                    | Access   | Description                    |
| ------ | --------------------------------------- | -------- | ------------------------------ |
| PUT    | `/api/customers/me`                     | Customer | Update own profile             |
| PUT    | `/api/customers/me/password`            | Customer | Change own password            |
| GET    | `/api/customers/me/dashboard`           | Customer | Aggregated customer dashboard  |
| GET    | `/api/customers`                        | Admin    | List/search customers          |
| GET    | `/api/customers/{id}`                   | Admin    | Customer detail                |
| GET    | `/api/customers/{id}/purchases`         | Admin    | That customer's purchases      |
| GET    | `/api/customers/{id}/current-plan`      | Admin    | That customer's active plan    |

**Dashboard and reference**

| Method | Path                        | Access | Description                          |
| ------ | --------------------------- | ------ | ------------------------------------ |
| GET    | `/api/admin/dashboard`      | Admin  | Stats, recent activity, plan sales   |
| GET    | `/api/regions`              | Public | All US states                        |
| GET    | `/api/regions/service-areas`| Public | States with at least one active plan |
| GET    | `/api/health`               | Public | Health check                         |

### Error format

Every error returns the same shape, so both frontends render failures with one helper:

```json
{ "detail": "The Basic HVAC Care plan is not offered in Nevada. Please choose a plan available in your region." }
```

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| 400    | Missing state, invalid state code, wrong current password             |
| 401    | Bad credentials, missing/expired/invalid token                        |
| 403    | Wrong role for the endpoint, deactivated account                      |
| 404    | Unknown plan, purchase or customer (also used to hide others' orders) |
| 409    | Duplicate email, duplicate plan name, plan unavailable in region, invalid status transition, deleting a plan with purchases |
| 422    | Request body failed validation (flattened into one readable sentence) |

---

## Data model

```
users                              plans
├── id (PK)                        ├── id (PK)
├── first_name, last_name          ├── name, slug (unique)
├── email (unique)                 ├── description
├── password_hash                  ├── features (JSON array)
├── role  CUSTOMER | ADMIN         ├── base_monthly_price
├── phone, address, city,          ├── base_annual_price
│   state, zip_code                ├── is_active, display_order
└── is_active, created_at          └── created_at, updated_at
        │                                   │
        │ 1                               1 │
        │                                   │
        │ N          purchases          N   │            N   plan_regions
        └──────────► ├── id (PK)      ◄─────┘         ┌────► ├── id (PK)
                     ├── user_id  (FK)                │      ├── plan_id (FK)
                     ├── plan_id  (FK) ───────────────┘      ├── state_code
                     ├── status                              ├── monthly_price
                     ├── billing_cycle                       ├── annual_price
                     ├── state_code    ← snapshot            └── is_available
                     ├── price         ← snapshot              UNIQUE(plan_id, state_code)
                     ├── created_at, activated_at,
                     │   cancelled_at, expires_at
                     └── 1
                          │
                          │ N
                          ▼
              purchase_status_history
              ├── id (PK)
              ├── purchase_id (FK)
              ├── from_status (null on creation)
              ├── to_status
              ├── changed_by_user_id (FK → users)
              └── note, created_at
```

Two deliberate design decisions:

- **`plan_regions` does double duty.** A row both declares that a plan is sold in a state
  and sets the price there. A plan with no rows is not purchasable anywhere.
- **`purchases.price` and `purchases.state_code` are snapshots.** An admin can change a
  plan's price later; revenue reporting and the customer's own record must reflect what
  they actually agreed to pay. This is intentional denormalisation, not duplication.

US state names are reference data in `app/core/regions.py`, not a database table, and are
served over `GET /api/regions` so neither frontend hardcodes a state list.

### MySQL column types

| Field                          | MySQL type                     | Why                                                   |
| ------------------------------ | ------------------------------ | ----------------------------------------------------- |
| All prices                     | `DECIMAL(10,2)`                | Exact money. Never `FLOAT` - no binary rounding drift. |
| `plans.features`               | `JSON`                         | Native MySQL 8 JSON, holds the ordered feature list.   |
| `users.role`, `purchases.status`, `purchases.billing_cycle` | `ENUM(...)` | MySQL stores enums inline on the column rather than as a shared named type. |
| All timestamps                 | `DATETIME(6)`                  | Microsecond precision, storing UTC (see below).        |
| `is_active`, `is_available`    | `TINYINT(1)`                   | MySQL's boolean representation.                        |
| `description`, `note`          | `TEXT`                         | Unbounded free text.                                   |

Two MySQL details worth knowing if you extend the schema:

- **`TEXT` and `JSON` columns cannot have a `DEFAULT`.** `plans.description` and
  `plans.features` are therefore filled in by the ORM's Python-side defaults, not by the
  database.
- **MySQL has no timezone-aware timestamp type.** `app/database/types.py` defines
  `UTCDateTime`, which converts to UTC on write and re-attaches UTC on read, so the API
  still emits unambiguous `+00:00` timestamps exactly as it did before. Every pooled
  connection also runs `SET time_zone = '+00:00'` so server-side `CURRENT_TIMESTAMP(6)`
  defaults are UTC too.

---

## Business rules

Enforced in `app/services/`, not in the UI:

1. A customer can only purchase an **active** plan.
2. A customer can only purchase a plan **available in their state** — checked against
   their account address, never a value sent by the browser.
3. A customer holds **one** `PENDING` or `ACTIVE` plan at a time.
4. A customer can never read another customer's purchase (returns `404`, not `403`, so
   order IDs cannot be probed).
5. Customers cannot reach admin APIs; admins cannot use the customer login.
6. Status transitions are restricted to a fixed machine:

   ```
   PENDING ──► ACTIVE ──► EXPIRED
      │           │
      └──────► CANCELLED ◄┘

   CANCELLED and EXPIRED are terminal.
   ```

   Anything else returns `409` with an explanation of what is allowed.
7. Approving a purchase stamps `activated_at` and computes `expires_at`
   (30 days monthly, 365 days annual).
8. New active plans with an available region appear on the customer site immediately.
9. Inactive plans disappear from the catalogue and cannot be purchased.
10. Revenue is summed from `purchases.price` for `ACTIVE` and `EXPIRED` records — never
    hardcoded, never estimated.
11. A plan with purchase history cannot be deleted; it must be deactivated instead.

---

## Security notes

- **Passwords** are hashed with bcrypt and a per-password salt. No endpoint or schema in
  the project can return a password hash — `UserOut` and `UserSummary` simply have no
  such field.
- **JWTs** are signed HS256 with `JWT_SECRET_KEY` and carry only the user id and role.
  Every protected request re-loads the user from the database and re-checks their role
  and active flag, so revoking an account takes effect immediately.
- **Role checks are server-side.** The `RequireAuth` / `AdminShell` guards in the
  frontends are UX only; deleting them would not expose data.
- **SQL injection** is prevented by SQLAlchemy's parameterised queries. No raw SQL string
  is built anywhere in the project.
- **Input validation** happens at the edge through Pydantic schemas, including state code
  validation and password strength.
- **CORS** is restricted to the two frontend origins listed in `CORS_ORIGINS`.
- **Secrets stay on the server.** The frontends read exactly one environment variable,
  `NEXT_PUBLIC_API_URL`, which is a plain localhost URL. The JWT secret, database URL and
  SMTP password exist only in `backend/.env`, which is git-ignored.
- Tokens are stored in `localStorage` under **different keys per app**
  (`hvac_customer_token` / `hvac_admin_token`), so both apps can be open in one browser
  without clobbering each other.

---

## Try it out

A five-minute tour that exercises the whole system:

1. **Sign in as a customer** at http://localhost:3000/login as
   `maria.alvarez@example.com` / `Customer123!`. The dashboard shows her active
   Complete plan, priced for Florida.
2. **Compare regional pricing.** Sign out and open http://localhost:3000/plans. Switch
   the region picker between Florida, Texas, Arizona and California and watch every price
   change — all of it served by the API.
3. **Enroll in a plan.** Register a new account with a Texas address, pick a plan, and
   complete the demo checkout. Your purchase appears in *My Purchases* as `PENDING`, and
   the welcome and enrollment emails appear in the backend terminal.
4. **Approve it.** Sign in to the admin panel at http://localhost:3001 as
   `admin@hvacdemo.com` / `Admin123!`, open **Purchases**, filter by `PENDING`, open the
   new enrollment and click **Approve and activate**.
5. **See it propagate.** Back on the customer site, the dashboard now shows the plan as
   `ACTIVE` with coverage dates. On the admin dashboard, *Active Plans Sold* and
   *Total Revenue* have both moved.
6. **Create a plan.** In the admin panel go to **Plans → Create plan**, add features, and
   assign it to Texas with a price. Reload the customer Plans page with Texas selected —
   the new plan is there, with no code change.

---

## Troubleshooting

**`Access denied for user 'root'@'localhost'` (MySQL error 1045)**
The password in `DATABASE_URL` does not match your MySQL install. Remember that special
characters must be **percent-encoded** inside a URL: `#` is `%23`, `@` is `%40`, `:` is
`%3A`, `/` is `%2F`, `?` is `%3F`. So the password `Rehan#786@1234` is written
`Rehan%23786%401234` in `DATABASE_URL`.

**`Can't connect to MySQL server on 'localhost'` (error 2003)**
The MySQL service is not running: `Start-Service MySQL80`.

**`Unknown database 'hvac_db'` (error 1049)**
Run `CREATE DATABASE hvac_db;` as shown in step 1.

**`cryptography package is required`**
MySQL 8 defaults to the `caching_sha2_password` auth plugin, which PyMySQL needs the
`cryptography` package for. It is listed in `requirements.txt` - re-run
`pip install -r requirements.txt`.

**`Could not reach the server` in the browser**
The backend is not running, or `NEXT_PUBLIC_API_URL` is wrong. Confirm
http://localhost:8000/api/health responds. After changing a `.env.local`, restart the
Next.js dev server — Next only reads env files at startup.

**CORS errors in the browser console**
Add the origin to `CORS_ORIGINS` in `backend/.env` and restart uvicorn.

**`Database already contains N user(s)`**
`seed.py` will not overwrite existing data. Use `python seed.py --reset`.

**Port already in use**
Change the port in that app's `package.json` `dev` script (and add the new origin to
`CORS_ORIGINS`), or stop whatever else is listening.

**Emails do not arrive**
In `console` mode they are only logged to the backend terminal — that is expected. Set
`EMAIL_MODE=file` to get openable `.html` files, or configure SMTP.
