"""Enumerations shared by the ORM models and the Pydantic schemas."""

from enum import Enum


class UserRole(str, Enum):
    """Only two roles exist in this system."""

    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"


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
