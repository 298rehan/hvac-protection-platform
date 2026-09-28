"""Dashboard endpoints - one aggregated request per dashboard."""

from fastapi import APIRouter

from app.core.deps import AdminUser, CustomerUser, DbSession
from app.schemas.dashboard import AdminDashboardOut, CustomerDashboardOut
from app.services import dashboard_service

router = APIRouter(tags=["Dashboard"])


@router.get(
    "/api/admin/dashboard",
    response_model=AdminDashboardOut,
    summary="Admin dashboard statistics (admin)",
)
def admin_dashboard(db: DbSession, _: AdminUser):
    """Every figure is computed from the database at request time."""
    return dashboard_service.build_admin_dashboard(db)


@router.get(
    "/api/customers/me/dashboard",
    response_model=CustomerDashboardOut,
    summary="My dashboard",
)
def customer_dashboard(db: DbSession, customer: CustomerUser):
    return dashboard_service.build_customer_dashboard(db, customer)
