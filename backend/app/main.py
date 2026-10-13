"""FastAPI application entry point

Run locally with:  uvicorn app.main:app --reload --port 8000
Interactive docs:  http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.routers import (
    ac_units,
    auth,
    customers,
    dashboard,
    photos,
    plans,
    purchases,
    regions,
    service_requests,
    technicians,
)
from app.services.activity import MaintenanceWorker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("app")

DESCRIPTION = """
REST API for a regional HVAC protection-plan business.

* **Customers** register with a service address; their US state decides which
  plans they are shown and what those plans cost.
* **Admins** manage plans, regional pricing, the approval of enrollments, and
  service requests - review, approval and technician assignment.
* **Customers** register AC units under their plan and submit service requests
  with photos; **technicians** record inspections and repairs.

Authenticate with `POST /api/auth/login` (customers) or
`POST /api/auth/staff/login` (admins and technicians), then click **Authorize**
and paste the `access_token`.

> This is a portfolio/demo system. Checkout is simulated - no payment gateway is
> involved and no card details are ever collected.
"""

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Run the outbox / upload-cleanup worker for the life of the process."""
    # Loud, secret-free warnings so a misconfigured server shows up in the logs
    # instead of failing silently.
    if settings.jwt_secret_key == "insecure-development-secret-change-me":
        logger.critical(
            "JWT_SECRET_KEY is not set - tokens are signed with the public default key. "
            "Set JWT_SECRET_KEY in the server's .env."
        )
    if not settings.s3_bucket_name:
        logger.warning("S3_BUCKET_NAME is not set - photo uploads are disabled (503).")
    if not settings.dynamodb_activity_table:
        logger.warning(
            "DYNAMODB_ACTIVITY_TABLE is not set - activity events stay in the MySQL outbox."
        )
    worker = None
    if settings.activity_worker_enabled:
        worker = MaintenanceWorker(settings.activity_worker_interval_seconds)
        worker.start()
    try:
        yield
    finally:
        if worker is not None:
            worker.stop()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    description=DESCRIPTION,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Authentication", "description": "Registration, sign in, current user."},
        {"name": "Plans", "description": "Plan catalogue and regional pricing."},
        {"name": "Purchases", "description": "Demo checkout and the enrollment lifecycle."},
        {"name": "Customers", "description": "Customer profile and the admin directory."},
        {"name": "Dashboard", "description": "Aggregated statistics for both dashboards."},
        {"name": "Regions", "description": "US state reference data."},
        {"name": "AC Units", "description": "Customer AC unit registration."},
        {"name": "Service Requests", "description": "Repair and maintenance job lifecycle."},
        {"name": "Photos", "description": "Private photo uploads via presigned S3 URLs."},
        {"name": "Technicians", "description": "Technician accounts (admin)."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# `dashboard` is included before `customers` so /api/customers/me/dashboard is
# matched before any /api/customers/{customer_id} pattern.
app.include_router(auth.router)
app.include_router(regions.router)
app.include_router(plans.router)
app.include_router(purchases.router)
app.include_router(dashboard.router)
app.include_router(customers.router)
app.include_router(ac_units.router)
app.include_router(service_requests.router)
app.include_router(photos.router)
app.include_router(technicians.router)


# --- Error handling -------------------------------------------------------
# Every error leaves this API as {"detail": "..."} so both frontends can render
# failures with one shared helper.


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Flatten Pydantic's error list into one readable sentence."""
    problems = []
    for error in exc.errors():
        location = [str(part) for part in error["loc"]
                    if part not in ("body", "query", "path")]
        field = ".".join(location) or "request"
        problems.append(f"{field}: {error['msg']}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        # jsonable_encoder: custom validators put the raw ValueError in
        # `ctx`, which the JSON encoder cannot serialise (that was a 500).
        content={"detail": "; ".join(
            problems) or "Invalid request.", "errors": jsonable_encoder(exc.errors())},
    )


# MySQL server error codes we translate into meaningful HTTP responses.
# https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
MYSQL_DUPLICATE_ENTRY = 1062
MYSQL_PARENT_ROW_IN_USE = 1451  # deleting a row another table still references
MYSQL_CHILD_ROW_MISSING_PARENT = 1452  # referencing a row that does not exist
MYSQL_COLUMN_CANNOT_BE_NULL = 1048
MYSQL_DATA_TOO_LONG = 1406

# Unique constraints mapped to a message safe to show a user. The raw driver
# message is never returned: it echoes the conflicting value and the internal
# index name.
DUPLICATE_KEY_MESSAGES = {
    "ix_users_email": "An account with this email address already exists.",
    "plans.name": "A plan with that name already exists.",
    "ix_plans_slug": "A plan with that name already exists.",
    "uq_plan_regions_plan_state": "That plan already has pricing for this state.",
}


def _db_error_code(exc: SQLAlchemyError) -> int | None:
    """Pull the MySQL errno out of a wrapped driver exception, if present."""
    orig = getattr(exc, "orig", None)
    args = getattr(orig, "args", None)
    if args and isinstance(args[0], int):
        return args[0]
    return None


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Constraint violations.

    Most are already caught and reported with better wording by the service
    layer (duplicate email on register, duplicate plan name, deleting a plan
    that has purchases). This handler is the backstop for races and for anything
    the service layer does not pre-check.
    """
    # Logged server-side only - `exc.orig` contains the offending values.
    logger.warning("Database integrity error on %s: %s",
                   request.url.path, exc.orig)
    code = _db_error_code(exc)

    if code == MYSQL_DUPLICATE_ENTRY:
        raw = str(getattr(exc, "orig", "")).lower()
        detail = next(
            (message for key, message in DUPLICATE_KEY_MESSAGES.items()
             if key.lower() in raw),
            "That record already exists.",
        )
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": detail})

    if code == MYSQL_PARENT_ROW_IN_USE:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": (
                    "This record is still referenced by other data and cannot be removed."
                )
            },
        )

    if code == MYSQL_CHILD_ROW_MISSING_PARENT:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": "That request refers to a record that does not exist."},
        )

    if code in (MYSQL_COLUMN_CANNOT_BE_NULL, MYSQL_DATA_TOO_LONG):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "One or more fields are missing or too long."},
        )

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "That change conflicts with existing data."},
    )


@app.exception_handler(OperationalError)
async def operational_error_handler(request: Request, exc: OperationalError):
    """MySQL unreachable, credentials rejected, unknown database, dropped connection.

    The driver message can contain the host, port and user, so only a fixed
    message is returned; the detail goes to the server log for the developer.
    """
    logger.error(
        "Database connection error on %s (MySQL errno %s): %s",
        request.url.path,
        _db_error_code(exc),
        exc.orig,
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "The database is unavailable. Please try again shortly."},
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("Database error on %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "The database is unavailable. Please try again shortly."},
    )


# --- Meta endpoints -------------------------------------------------------


@app.get("/", tags=["Health"], summary="API root")
def root():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
        "environment": settings.environment,
    }


@app.get("/api/health", tags=["Health"], summary="Health check")
def health():
    return {"status": "ok", "email_mode": settings.email_mode}
