"""ORM models. Importing this package registers every table on `Base.metadata`."""

from app.models.enums import (
    ALLOWED_STATUS_TRANSITIONS,
    PHOTO_RECOMMENDED_SERVICE_TYPES,
    PREFERRED_WINDOW_HOURS,
    ORDER_TRANSITIONS,
    SERVICE_REQUEST_TRANSITIONS,
    TERMINAL_ORDER_STATUSES,
    TERMINAL_SERVICE_REQUEST_STATUSES,
    AcType,
    AppointmentStatus,
    BillingCycle,
    CustomPlanKind,
    DiscountType,
    PhotoCategory,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PhotoStatus,
    PreferredWindow,
    PricingType,
    PurchaseStatus,
    ReportedCondition,
    ServiceFrequency,
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
from app.models.technician_profile import TechnicianProfile
from app.models.catalog import DiscountCode, HvacService, ServiceAddon, ServiceCategory
from app.models.custom_plan import CustomPlan, CustomPlanItem
from app.models.order import ServiceOrder, ServiceOrderItem
from app.models.appointment import Appointment

__all__ = [
    "ALLOWED_STATUS_TRANSITIONS",
    "ORDER_TRANSITIONS",
    "TERMINAL_ORDER_STATUSES",
    "CustomPlan",
    "CustomPlanItem",
    "CustomPlanKind",
    "DiscountCode",
    "DiscountType",
    "HvacService",
    "OrderStatus",
    "PaymentMethod",
    "PaymentStatus",
    "PricingType",
    "ServiceAddon",
    "ServiceCategory",
    "ServiceFrequency",
    "ServiceOrder",
    "ServiceOrderItem",
    "PHOTO_RECOMMENDED_SERVICE_TYPES",
    "PREFERRED_WINDOW_HOURS",
    "SERVICE_REQUEST_TRANSITIONS",
    "TERMINAL_SERVICE_REQUEST_STATUSES",
    "AcType",
    "AcUnit",
    "ActivityOutbox",
    "Appointment",
    "AppointmentStatus",
    "BillingCycle",
    "Photo",
    "PhotoCategory",
    "PhotoStatus",
    "PreferredWindow",
    "Plan",
    "PlanRegion",
    "Purchase",
    "PurchaseStatus",
    "PurchaseStatusHistory",
    "ReportedCondition",
    "ServiceRequest",
    "ServiceRequestStatus",
    "ServiceType",
    "TechnicianProfile",
    "User",
    "UserRole",
]
