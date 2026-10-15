"""HVAC service catalog: public browsing, price quotes, availability, and admin management.

Admins deactivate services instead of deleting them, so past orders keep their
history.
"""

import re

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import AdminUser, DbSession
from app.core.regions import is_valid_state
from app.models import DiscountCode, HvacService, ServiceAddon, ServiceCategory
from app.schemas.catalog import (
    CategoryIn,
    CategoryOut,
    DiscountIn,
    DiscountOut,
    QuoteIn,
    QuoteOut,
    ServiceIn,
    ServiceOut,
)
from app.schemas.order import AvailabilitySlot
from app.services import order_service, pricing_service

router = APIRouter(prefix="/api/catalog", tags=["Service Catalog"])


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def _public(service: HvacService) -> ServiceOut:
    out = ServiceOut.model_validate(service)
    out.addons = [a for a in out.addons if a.is_active]
    return out


# --- Public ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryOut], summary="Active service categories")
def list_categories(db: DbSession):
    return list(db.execute(
        select(ServiceCategory).where(ServiceCategory.is_active.is_(True))
        .order_by(ServiceCategory.display_order, ServiceCategory.name)
    ).scalars())


@router.get("/services", response_model=list[ServiceOut], summary="Browse and search active services")
def list_services(
    db: DbSession,
    category: str | None = Query(default=None, max_length=100, description="Category slug"),
    q: str | None = Query(default=None, max_length=100, description="Search name and description"),
    state: str | None = Query(default=None, min_length=2, max_length=2),
):
    stmt = (
        select(HvacService)
        .join(ServiceCategory, ServiceCategory.id == HvacService.category_id)
        .where(HvacService.is_active.is_(True), ServiceCategory.is_active.is_(True))
        .order_by(ServiceCategory.display_order, HvacService.display_order, HvacService.name)
    )
    if category:
        stmt = stmt.where(ServiceCategory.slug == category)
    if q and q.strip():
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(HvacService.name).like(needle),
                              func.lower(HvacService.description).like(needle)))
    services = db.execute(stmt).unique().scalars().all()
    if state:
        code = state.upper()
        services = [s for s in services if s.available_states is None or code in s.available_states]
    return [_public(s) for s in services]


@router.get("/services/{slug}", response_model=ServiceOut, summary="One service, by slug or id")
def get_service(slug: str, db: DbSession):
    condition = HvacService.id == int(slug) if slug.isdigit() else HvacService.slug == slug
    service = db.execute(select(HvacService).where(condition)).unique().scalars().first()
    if service is None or not service.is_active or not service.category.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return _public(service)


@router.post("/quote", response_model=QuoteOut, summary="Price a selection of services (server-side)")
def quote(payload: QuoteIn, db: DbSession):
    """Prices come only from the database. Problems are listed instead of failing."""
    return pricing_service.price_items(
        db, payload.items, discount_code=payload.discount_code, state=payload.state
    ).quote


@router.get("/availability", response_model=list[AvailabilitySlot], summary="Bookable visit windows for an address")
def get_availability(
    db: DbSession,
    state: str = Query(min_length=2, max_length=2),
    zip_code: str = Query(min_length=3, max_length=10),
    days: int = Query(default=14, ge=1, le=60),
):
    if not is_valid_state(state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid state code.")
    return order_service.availability(db, state=state.upper(), zip_code=zip_code.strip(), days=days)


# --- Admin: categories --------------------------------------------------------------


@router.get("/admin/categories", response_model=list[CategoryOut], summary="All categories (admin)")
def admin_categories(db: DbSession, _: AdminUser):
    return list(db.execute(select(ServiceCategory).order_by(ServiceCategory.display_order, ServiceCategory.name)).scalars())


def _save_category(db, category: ServiceCategory, payload: CategoryIn) -> ServiceCategory:
    clash = db.execute(select(ServiceCategory.id).where(
        func.lower(ServiceCategory.name) == payload.name.strip().lower(), ServiceCategory.id != (category.id or 0)
    )).first()
    if clash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A category with that name already exists.")
    for field, value in payload.model_dump().items():
        setattr(category, field, value.strip() if isinstance(value, str) else value)
    category.slug = slugify(payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.post("/admin/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED,
             summary="Create a category (admin)")
def create_category(payload: CategoryIn, db: DbSession, _: AdminUser):
    return _save_category(db, ServiceCategory(), payload)


@router.put("/admin/categories/{category_id}", response_model=CategoryOut, summary="Update a category (admin)")
def update_category(category_id: int, payload: CategoryIn, db: DbSession, _: AdminUser):
    category = db.get(ServiceCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return _save_category(db, category, payload)


# --- Admin: services ------------------------------------------------------------------


@router.get("/admin/services", response_model=list[ServiceOut], summary="All services incl. inactive (admin)")
def admin_services(db: DbSession, _: AdminUser):
    return list(db.execute(select(HvacService).order_by(HvacService.category_id, HvacService.display_order)).unique().scalars())


def _save_service(db, service: HvacService, payload: ServiceIn) -> HvacService:
    if db.get(ServiceCategory, payload.category_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That category does not exist.")
    clash = db.execute(select(HvacService.id).where(
        func.lower(HvacService.name) == payload.name.strip().lower(), HvacService.id != (service.id or 0)
    )).first()
    if clash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A service with that name already exists.")

    data = payload.model_dump(exclude={"addons"})
    data["allowed_frequencies"] = [f.value for f in payload.allowed_frequencies]
    for field, value in data.items():
        setattr(service, field, value.strip() if isinstance(value, str) else value)
    service.slug = slugify(payload.name)

    # Add-ons: update listed ones, create new ones, deactivate the rest (kept for history).
    existing = {a.id: a for a in service.addons}
    kept = set()
    for addon_in in payload.addons:
        if addon_in.id is not None:
            addon = existing.get(addon_in.id)
            if addon is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Add-on {addon_in.id} is not part of this service.")
            kept.add(addon.id)
        else:
            addon = ServiceAddon()
            service.addons.append(addon)
        addon.name, addon.price, addon.is_active = addon_in.name.strip(), addon_in.price, addon_in.is_active
    for addon_id, addon in existing.items():
        if addon_id not in kept:
            addon.is_active = False

    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.post("/admin/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED,
             summary="Create a service (admin)")
def create_service(payload: ServiceIn, db: DbSession, _: AdminUser):
    return _save_service(db, HvacService(), payload)


@router.put("/admin/services/{service_id}", response_model=ServiceOut, summary="Update a service and its price (admin)")
def update_service(service_id: int, payload: ServiceIn, db: DbSession, _: AdminUser):
    service = db.get(HvacService, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return _save_service(db, service, payload)


# --- Admin: discount codes -------------------------------------------------------------


@router.get("/admin/discounts", response_model=list[DiscountOut], summary="Discount codes (admin)")
def list_discounts(db: DbSession, _: AdminUser):
    return list(db.execute(select(DiscountCode).order_by(DiscountCode.code)).scalars())


def _save_discount(db, discount: DiscountCode, payload: DiscountIn) -> DiscountCode:
    code = payload.code.strip().upper()
    clash = db.execute(select(DiscountCode.id).where(DiscountCode.code == code, DiscountCode.id != (discount.id or 0))).first()
    if clash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That discount code already exists.")
    for field, value in payload.model_dump().items():
        setattr(discount, field, value)
    discount.code = code
    db.add(discount)
    db.commit()
    db.refresh(discount)
    return discount


@router.post("/admin/discounts", response_model=DiscountOut, status_code=status.HTTP_201_CREATED,
             summary="Create a discount code (admin)")
def create_discount(payload: DiscountIn, db: DbSession, _: AdminUser):
    return _save_discount(db, DiscountCode(), payload)


@router.put("/admin/discounts/{discount_id}", response_model=DiscountOut, summary="Update a discount code (admin)")
def update_discount(discount_id: int, payload: DiscountIn, db: DbSession, _: AdminUser):
    discount = db.get(DiscountCode, discount_id)
    if discount is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount code not found.")
    return _save_discount(db, discount, payload)
