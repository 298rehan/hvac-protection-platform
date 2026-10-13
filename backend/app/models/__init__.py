"""ORM models. Importing this package registers every table on `Base.metadata`."""

from app.models.enums import (
    ALLOWED_STATUS_TRANSITIONS,
    PHOTO_RECOMMENDED_SERVICE_TYPES,
    SERVICE_REQUEST_TRANSITIONS,
    TERMINAL_SERVICE_REQUEST_STATUSES,
    AcType,
    BillingCycle,
    PhotoCategory,
    PhotoStatus,
    PurchaseStatus,
    ReportedCondition,
    ServiceRequestStatus,
    ServiceType,
    UserRole,
)
from app.models.plan import Plan, PlanRegion
from app.models.purchase import Purchase, PurchaseStatusHistory
from app.models.user import User
from app.models.ac_unit import AcUnit
from app.models.service_request import ServiceRequest
from app.models.photo import Photo
from app.models.activity_outbox import ActivityOutbox

__all__ = [
    "ALLOWED_STATUS_TRANSITIONS",
    "PHOTO_RECOMMENDED_SERVICE_TYPES",
    "SERVICE_REQUEST_TRANSITIONS",
    "TERMINAL_SERVICE_REQUEST_STATUSES",
    "AcType",
    "AcUnit",
    "ActivityOutbox",
    "BillingCycle",
    "Photo",
    "PhotoCategory",
    "PhotoStatus",
    "Plan",
    "PlanRegion",
    "Purchase",
    "PurchaseStatus",
    "PurchaseStatusHistory",
    "ReportedCondition",
    "ServiceRequest",
    "ServiceRequestStatus",
    "ServiceType",
    "User",
    "UserRole",
]
