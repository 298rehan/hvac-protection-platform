"""US state reference data, so neither frontend hardcodes a state list."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DbSession
from app.core.regions import US_STATES
from app.models import Plan, PlanRegion
from app.schemas.user import RegionOut

router = APIRouter(prefix="/api/regions", tags=["Regions"])


@router.get("", response_model=list[RegionOut], summary="All US states")
def list_regions():
    """The full state list, used by the registration and profile forms."""
    return [RegionOut(code=code, name=name) for code, name in sorted(US_STATES.items())]


@router.get(
    "/service-areas",
    response_model=list[RegionOut],
    summary="States we currently sell plans in",
)
def list_service_areas(db: DbSession):
    """States with at least one active, available plan.

    Driven entirely by the data, so adding a plan region in the admin app
    immediately adds that state to the customer site's region picker.
    """
    stmt = (
        select(PlanRegion.state_code)
        .join(Plan, Plan.id == PlanRegion.plan_id)
        .where(Plan.is_active.is_(True), PlanRegion.is_available.is_(True))
        .distinct()
    )
    codes = sorted(db.execute(stmt).scalars().all())
    return [RegionOut.from_code(code) for code in codes]
