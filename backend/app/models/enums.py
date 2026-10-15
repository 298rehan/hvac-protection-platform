"""Enumerations shared by the ORM models and the Pydantic schemas."""

from enum import Enum


class UserRole(str, Enum):
    """Account types. Technicians are staff created by an admin, never self-registered."""

    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"
    TECHNICIAN = "TECHNICIAN"


class PurchaseStatus(str, Enum):
    """Lifecycle of a protection-plan purchase."""

    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class BillingCycle(str, Enum):
    MONTHLY = "MONTHLY"
    ANNUAL = "ANNUAL"


# Which status changes the admin is allowed to make. Anything not listed here is
# rejected with a 409 by the purchase service.
ALLOWED_STATUS_TRANSITIONS: dict[PurchaseStatus, set[PurchaseStatus]] = {
    PurchaseStatus.PENDING: {PurchaseStatus.ACTIVE, PurchaseStatus.CANCELLED},
    PurchaseStatus.ACTIVE: {PurchaseStatus.CANCELLED, PurchaseStatus.EXPIRED},
    PurchaseStatus.CANCELLED: set(),
    PurchaseStatus.EXPIRED: set(),
}


# --- AC units ---------------------------------------------------------------


class AcType(str, Enum):
    CENTRAL_SPLIT = "CENTRAL_SPLIT"
    DUCTLESS_MINI_SPLIT = "DUCTLESS_MINI_SPLIT"
    HEAT_PUMP = "HEAT_PUMP"
    PACKAGED = "PACKAGED"
    WINDOW = "WINDOW"
    PORTABLE = "PORTABLE"
    OTHER = "OTHER"
    FURNACE = "FURNACE"


class ReportedCondition(str, Enum):
    """The customer's own description - never treated as a verified assessment."""

    GOOD = "GOOD"
    FAIR = "FAIR"
    POOR = "POOR"
    NOT_WORKING = "NOT_WORKING"
    UNKNOWN = "UNKNOWN"


# --- Service requests -------------------------------------------------------


class ServiceType(str, Enum):
    ROUTINE_MAINTENANCE = "ROUTINE_MAINTENANCE"
    NOT_COOLING = "NOT_COOLING"
    NOT_HEATING = "NOT_HEATING"
    WATER_LEAK = "WATER_LEAK"
    STRANGE_NOISE = "STRANGE_NOISE"
    VISIBLE_DAMAGE = "VISIBLE_DAMAGE"
    OTHER = "OTHER"
    SYSTEM_NOT_STARTING = "SYSTEM_NOT_STARTING"
    THERMOSTAT_ISSUE = "THERMOSTAT_ISSUE"


# Service types where photos help the review. The customer app asks for them;
# they are still optional because photos cannot show internal faults.
PHOTO_RECOMMENDED_SERVICE_TYPES = frozenset({ServiceType.WATER_LEAK, ServiceType.VISIBLE_DAMAGE})


class ServiceRequestStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ASSIGNED = "ASSIGNED"
    INSPECTION_IN_PROGRESS = "INSPECTION_IN_PROGRESS"
    AWAITING_CUSTOMER_APPROVAL = "AWAITING_CUSTOMER_APPROVAL"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    # Added later; kept at the end so the MySQL ENUM change is a pure append.
    NEEDS_INFO = "NEEDS_INFO"  # "More information required" from the customer
    SCHEDULED = "SCHEDULED"  # technician assigned and appointment confirmed


TERMINAL_SERVICE_REQUEST_STATUSES = frozenset(
    {ServiceRequestStatus.REJECTED, ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED}
)

_S = ServiceRequestStatus
_C, _A, _T = UserRole.CUSTOMER, UserRole.ADMIN, UserRole.TECHNICIAN

# Every permitted status change and the roles allowed to make it. Anything not
# listed is rejected with a 409 by the service-request service, which also
# applies the per-transition preconditions (ownership, assigned technician,
# required notes and photos).
SERVICE_REQUEST_TRANSITIONS: dict[tuple[ServiceRequestStatus, ServiceRequestStatus], frozenset[UserRole]] = {
    (_S.SUBMITTED, _S.UNDER_REVIEW): frozenset({_A}),
    (_S.UNDER_REVIEW, _S.NEEDS_INFO): frozenset({_A}),
    (_S.NEEDS_INFO, _S.UNDER_REVIEW): frozenset({_C}),
    (_S.NEEDS_INFO, _S.CANCELLED): frozenset({_C, _A}),
    (_S.SUBMITTED, _S.CANCELLED): frozenset({_C, _A}),
    (_S.UNDER_REVIEW, _S.APPROVED): frozenset({_A}),
    (_S.UNDER_REVIEW, _S.REJECTED): frozenset({_A}),
    (_S.UNDER_REVIEW, _S.CANCELLED): frozenset({_C, _A}),
    (_S.APPROVED, _S.ASSIGNED): frozenset({_A}),
    (_S.APPROVED, _S.CANCELLED): frozenset({_C, _A}),
    (_S.ASSIGNED, _S.INSPECTION_IN_PROGRESS): frozenset({_T}),
    (_S.ASSIGNED, _S.CANCELLED): frozenset({_A}),
    (_S.ASSIGNED, _S.SCHEDULED): frozenset({_A}),
    (_S.SCHEDULED, _S.ASSIGNED): frozenset({_A}),  # appointment cancelled / reassigned
    (_S.SCHEDULED, _S.INSPECTION_IN_PROGRESS): frozenset({_T}),
    (_S.SCHEDULED, _S.CANCELLED): frozenset({_A}),
    (_S.INSPECTION_IN_PROGRESS, _S.AWAITING_CUSTOMER_APPROVAL): frozenset({_T}),
    (_S.INSPECTION_IN_PROGRESS, _S.IN_PROGRESS): frozenset({_T}),
    (_S.INSPECTION_IN_PROGRESS, _S.COMPLETED): frozenset({_T}),
    (_S.INSPECTION_IN_PROGRESS, _S.CANCELLED): frozenset({_A}),
    (_S.AWAITING_CUSTOMER_APPROVAL, _S.IN_PROGRESS): frozenset({_C}),
    (_S.AWAITING_CUSTOMER_APPROVAL, _S.CANCELLED): frozenset({_C, _A}),
    (_S.IN_PROGRESS, _S.COMPLETED): frozenset({_T}),
    (_S.IN_PROGRESS, _S.CANCELLED): frozenset({_A}),
}


# --- Photos -----------------------------------------------------------------


class PhotoCategory(str, Enum):
    INITIAL = "INITIAL"  # AC unit condition at registration
    CUSTOMER = "CUSTOMER"  # attached by the customer to a service request
    INSPECTION = "INSPECTION"
    BEFORE = "BEFORE"
    AFTER = "AFTER"


class PreferredWindow(str, Enum):
    """Customer's preferred visit window, in the property's local time."""

    MORNING = "MORNING"  # 08:00-12:00
    AFTERNOON = "AFTERNOON"  # 12:00-16:00
    EVENING = "EVENING"  # 16:00-19:00


PREFERRED_WINDOW_HOURS: dict[PreferredWindow, tuple[int, int]] = {
    PreferredWindow.MORNING: (8, 12),
    PreferredWindow.AFTERNOON: (12, 16),
    PreferredWindow.EVENING: (16, 19),
}


class AppointmentStatus(str, Enum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class PhotoStatus(str, Enum):
    """PENDING until the backend has verified the uploaded object in S3."""

    PENDING = "PENDING"
    UPLOADED = "UPLOADED"


# --- Service catalog and orders ------------------------------------------------


class PricingType(str, Enum):
    FIXED = "FIXED"  # one confirmed price per unit
    STARTING_AT = "STARTING_AT"  # estimate; final price set after inspection
    PER_UNIT = "PER_UNIT"  # price x quantity (e.g. per filter)


class ServiceFrequency(str, Enum):
    ONE_TIME = "ONE_TIME"
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    YEARLY = "YEARLY"


class CustomPlanKind(str, Enum):
    PLAN = "PLAN"  # a named, saved custom plan
    CART = "CART"  # the customer's single shopping cart


class DiscountType(str, Enum):
    PERCENT = "PERCENT"
    AMOUNT = "AMOUNT"


class OrderStatus(str, Enum):
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"
    SCHEDULED = "SCHEDULED"  # technician assigned and visit booked
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentMethod(str, Enum):
    # No payment gateway exists: the customer pays the technician on the day.
    PAY_ON_SERVICE = "PAY_ON_SERVICE"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"  # nothing has been charged
    PAID = "PAID"  # recorded by an admin after payment was received
    VOID = "VOID"  # order cancelled before payment


TERMINAL_ORDER_STATUSES = frozenset({OrderStatus.COMPLETED, OrderStatus.CANCELLED})

_O = OrderStatus
# Allowed order status changes and who may make them (customer, admin, technician).
ORDER_TRANSITIONS: dict[tuple[OrderStatus, OrderStatus], frozenset[UserRole]] = {
    (_O.PENDING_CONFIRMATION, _O.CONFIRMED): frozenset({_A}),
    (_O.PENDING_CONFIRMATION, _O.CANCELLED): frozenset({_C, _A}),
    (_O.CONFIRMED, _O.SCHEDULED): frozenset({_A}),
    (_O.CONFIRMED, _O.CANCELLED): frozenset({_C, _A}),
    (_O.SCHEDULED, _O.IN_PROGRESS): frozenset({_T}),
    (_O.SCHEDULED, _O.CANCELLED): frozenset({_A}),
    (_O.IN_PROGRESS, _O.COMPLETED): frozenset({_T, _A}),
}
