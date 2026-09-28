"""Plan endpoints.

`GET` routes are public/customer-facing and always priced for one state.
`POST` / `PUT` / `DELETE` require the ADMIN role.
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.regions import US_STATES, is_valid_state
from app.schemas.plan import PlanCreate, PlanOut, PlanPublicOut, PlanRegionOut, PlanUpdate
from app.services import plan_service

router = APIRouter(prefix="/api/plans", tags=["Plans"])


def _serialise(plan) -> PlanOut:
    out = PlanOut.model_validate(plan)
    out.regions = [PlanRegionOut.from_model(r) for r in plan.regions]
    return out


def _resolve_state(state: str | None, user) -> str:
    """Explicit ?state= wins; otherwise fall back to the signed-in customer's state."""
    if state:
        if not is_valid_state(state):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{state}' is not a valid US state code.",
            )
        return state.upper()
    if user is not None and user.state:
        return user.state.upper()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="A state code is required to price plans. Pass ?state=FL or sign in.",
    )


@router.get(
    "",
    response_model=list[PlanPublicOut],
    summary="Plans available in a region",
)
def list_plans(
    db: DbSession,
    state: str | None = Query(
        default=None,
        min_length=2,
        max_length=2,
        description="Two-letter US state code. Defaults to the signed-in customer's state.",
    ),
):
    """Public catalogue: active plans sold in `state`, priced for that state."""
    code = _resolve_state(state, None) if state else None
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A state code is required. Pass ?state=FL.",
        )
    return plan_service.list_public_plans(db, code)


@router.get(
    "/mine",
    response_model=list[PlanPublicOut],
    summary="Plans available in my region",
)
def list_my_plans(db: DbSession, user: CurrentUser):
    """Same as `GET /api/plans` but keyed off the signed-in customer's own state."""
    code = _resolve_state(None, user)
    return plan_service.list_public_plans(db, code)


@router.get("/admin/all", response_model=list[PlanOut], summary="All plans (admin)")
def list_all_plans(db: DbSession, _: AdminUser):
    """Every plan including inactive ones, with full regional pricing."""
    return [_serialise(p) for p in plan_service.list_plans_admin(db)]


@router.get("/{plan_id}", response_model=PlanPublicOut, summary="Plan detail for a region")
def get_plan(
    plan_id: int,
    db: DbSession,
    state: str | None = Query(default=None, min_length=2, max_length=2),
):
    plan = plan_service.get_plan_or_404(db, plan_id)
    code = (state or "").upper()
    if code and code not in US_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{state}' is not a valid US state code.",
        )
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A state code is required. Pass ?state=FL.",
        )
    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This plan is no longer offered."
        )
    return plan_service.to_public(plan, code)


@router.get("/{plan_id}/admin", response_model=PlanOut, summary="Plan detail (admin)")
def get_plan_admin(plan_id: int, db: DbSession, _: AdminUser):
    return _serialise(plan_service.get_plan_or_404(db, plan_id))


@router.post(
    "",
    response_model=PlanOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a plan (admin)",
)
def create_plan(payload: PlanCreate, db: DbSession, _: AdminUser):
    """New active plans appear on the customer site immediately for every state
    listed in `regions` - no frontend change required."""
    return _serialise(plan_service.create_plan(db, payload))


@router.put("/{plan_id}", response_model=PlanOut, summary="Update a plan (admin)")
def update_plan(plan_id: int, payload: PlanUpdate, db: DbSession, _: AdminUser):
    plan = plan_service.get_plan_or_404(db, plan_id)
    return _serialise(plan_service.update_plan(db, plan, payload))


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a plan (admin)",
)
def delete_plan(plan_id: int, db: DbSession, _: AdminUser):
    """Refused with 409 if any purchase references the plan."""
    plan = plan_service.get_plan_or_404(db, plan_id)
    plan_service.delete_plan(db, plan)
