"""Service catalog, custom plans, cart, pricing, checkout and the order lifecycle."""

import uuid
from datetime import date, time, timedelta
from decimal import Decimal

import pytest

from app.models import (
    DiscountCode,
    DiscountType,
    HvacService,
    PricingType,
    ServiceAddon,
    ServiceCategory,
    ServiceOrder,
    TechnicianProfile,
    UserRole,
)
from tests.conftest import SessionLocal, headers, make_user


@pytest.fixture
def catalog(db):
    cat = ServiceCategory(name="Servicing", slug="servicing", description="", icon="wrench")
    other = ServiceCategory(name="Repairs", slug="repairs", description="", icon="bolt")
    db.add_all([cat, other])
    db.flush()

    def svc(slug, name, price, category=cat, pricing=PricingType.FIXED, **kw):
        s = HvacService(slug=slug, name=name, description=f"{name} description", category_id=category.id,
                        pricing_type=pricing, price=Decimal(price), duration_minutes=kw.pop("minutes", 60),
                        allowed_frequencies=kw.pop("freqs", ["ONE_TIME", "QUARTERLY"]), **kw)
        db.add(s)
        return s

    services = {
        "inspection": svc("ac-inspection", "AC Inspection", "40.00"),
        "servicing": svc("ac-servicing", "AC Servicing", "80.00"),
        "filter": svc("filter", "Filter Replacement", "25.00", pricing=PricingType.PER_UNIT, unit_label="filter", max_quantity=6),
        "repair": svc("ac-repair", "AC Repair", "95.00", category=other, pricing=PricingType.STARTING_AT, freqs=["ONE_TIME"]),
        "retired": svc("retired", "Retired Service", "10.00", is_active=False),
        "texas": svc("tx-only", "Texas Only Service", "30.00", available_states=["TX"]),
    }
    db.flush()
    services["servicing"].addons = [ServiceAddon(name="Coil cleaning", price=Decimal("35.00"))]
    db.commit()
    return {k: v.id for k, v in services.items()} | {"coil": services["servicing"].addons[0].id}


@pytest.fixture
def area_tech(db, people):
    """A technician serving Florida, so visit slots exist for the FL customer."""
    tech = people["tech"]
    db.add(TechnicianProfile(user_id=tech.id, service_states=["FL"], service_zip_prefixes=[], specialties=[],
                             work_days=list(range(7)), work_start=time(6), work_end=time(21)))
    db.commit()
    return tech


def item(service_id, **kw):
    return {"service_id": service_id, **kw}


def quote(client, items, **kw):
    response = client.post("/api/catalog/quote", json={"items": items, **kw})
    assert response.status_code == 200, response.text
    return response.json()


def checkout_body(items, **kw):
    body = {
        "idempotency_key": str(uuid.uuid4()),
        "items": items,
        "address": "1 Main St", "city": "Miami", "state": "FL", "zip_code": "33101",
        "requested_date": (date.today() + timedelta(days=5)).isoformat(),
        "requested_window": "MORNING",
    }
    body.update(kw)
    return body


# --- Catalog ---------------------------------------------------------------------------


def test_catalog_browse_filter_search(client, catalog):
    services = client.get("/api/catalog/services").json()
    names = {s["name"] for s in services}
    assert "Retired Service" not in names and "AC Inspection" in names
    assert {s["name"] for s in client.get("/api/catalog/services?category=repairs").json()} == {"AC Repair"}
    assert [s["name"] for s in client.get("/api/catalog/services?q=filter").json()] == ["Filter Replacement"]
    assert "Texas Only Service" not in {s["name"] for s in client.get("/api/catalog/services?state=FL").json()}
    detail = client.get("/api/catalog/services/ac-servicing").json()
    assert detail["addons"][0]["name"] == "Coil cleaning"
    assert client.get("/api/catalog/services/retired").status_code == 404
    assert len(client.get("/api/catalog/categories").json()) == 2


# --- Pricing ---------------------------------------------------------------------------


def test_quote_matches_expected_subtotal(client, catalog):
    q = quote(client, [item(catalog["inspection"]), item(catalog["servicing"]), item(catalog["filter"])])
    assert q["subtotal"] == "145.00" and q["total"] == "145.00" and q["problems"] == []
    assert q["currency"] == "USD" and q["total_is_estimate"] is False


def test_quote_addons_quantities_and_estimates(client, catalog):
    q = quote(client, [
        item(catalog["servicing"], addon_ids=[catalog["coil"]]),
        item(catalog["filter"], quantity=3),
        item(catalog["repair"]),
    ])
    lines = {line["service_name"]: line for line in q["lines"]}
    assert lines["AC Servicing"]["line_total"] == "115.00"
    assert lines["Filter Replacement"]["line_total"] == "75.00"
    assert lines["AC Repair"]["is_estimate"] is True
    assert q["subtotal"] == "285.00" and q["total_is_estimate"] is True


def test_quote_reports_invalid_choices(client, catalog):
    q = quote(client, [
        item(catalog["retired"]),
        item(catalog["repair"], frequency="MONTHLY"),
        item(catalog["inspection"], addon_ids=[catalog["coil"]]),
        item(catalog["filter"], quantity=7),
        item(catalog["texas"]),
    ], state="FL")
    assert len(q["problems"]) == 5
    assert q["lines"] == [] and q["total"] == "0.00"


def test_negative_or_zero_quantity_rejected(client, catalog):
    for qty in (0, -1):
        assert client.post("/api/catalog/quote", json={"items": [item(catalog["inspection"], quantity=qty)]}).status_code == 422


def test_discounts(client, db, catalog):
    from datetime import datetime, timezone

    db.add_all([
        DiscountCode(code="SAVE10", discount_type=DiscountType.PERCENT, value=Decimal("10")),
        DiscountCode(code="TENOFF", discount_type=DiscountType.AMOUNT, value=Decimal("10"), min_subtotal=Decimal("100")),
        DiscountCode(code="OLD", discount_type=DiscountType.PERCENT, value=Decimal("50"),
                     expires_at=datetime(2020, 1, 1, tzinfo=timezone.utc)),
        DiscountCode(code="USEDUP", discount_type=DiscountType.PERCENT, value=Decimal("50"), max_uses=1, times_used=1),
    ])
    db.commit()
    items = [item(catalog["inspection"]), item(catalog["servicing"]), item(catalog["filter"])]
    assert quote(client, items, discount_code="save10")["discount_amount"] == "14.50"
    assert quote(client, items, discount_code="TENOFF")["total"] == "135.00"
    assert quote(client, [item(catalog["inspection"])], discount_code="TENOFF")["problems"]
    for bad in ("OLD", "USEDUP", "NOPE"):
        q = quote(client, items, discount_code=bad)
        assert q["problems"] and q["discount_amount"] == "0.00"


def test_tax_and_fee_only_when_configured(client, catalog, monkeypatch):
    from app.core.config import settings

    items = [item(catalog["inspection"]), item(catalog["servicing"])]
    q = quote(client, items)
    assert q["tax_amount"] == "0.00" and q["fee_amount"] == "0.00"
    monkeypatch.setattr(settings, "service_tax_rate", Decimal("0.0825"))
    monkeypatch.setattr(settings, "service_booking_fee", Decimal("5"))
    q = quote(client, items)
    assert q["tax_amount"] == "9.90" and q["fee_amount"] == "5.00" and q["total"] == "134.90"


# --- Cart and custom plans ------------------------------------------------------------


def test_cart_is_per_customer_and_priced_by_server(client, catalog, people):
    own, other = headers(people["customer"]), headers(people["other"])
    r = client.put("/api/cart", json={"items": [item(catalog["inspection"]), item(catalog["filter"], quantity=2)]}, headers=own)
    assert r.status_code == 200 and r.json()["quote"]["subtotal"] == "90.00"
    assert client.get("/api/cart", headers=other).json()["items"] == []
    assert client.delete("/api/cart", headers=own).status_code == 204
    assert client.get("/api/cart", headers=own).json()["quote"] is None


def test_custom_plans_save_edit_delete(client, catalog, people):
    own = headers(people["customer"])
    created = client.post("/api/custom-plans", headers=own, json={
        "name": "Summer prep", "items": [item(catalog["inspection"]), item(catalog["servicing"], frequency="QUARTERLY")],
    })
    assert created.status_code == 201
    plan = created.json()
    assert plan["quote"]["subtotal"] == "120.00"

    updated = client.put(f"/api/custom-plans/{plan['id']}", headers=own, json={
        "items": [item(catalog["servicing"], frequency="QUARTERLY", addon_ids=[catalog["coil"]])],
    }).json()
    assert updated["name"] == "Summer prep" and updated["quote"]["subtotal"] == "115.00"

    other = headers(people["other"])
    assert client.get(f"/api/custom-plans/{plan['id']}", headers=other).status_code == 404
    assert client.put(f"/api/custom-plans/{plan['id']}", headers=other, json={"items": []}).status_code == 404
    dup = client.post("/api/custom-plans", headers=own, json={"items": [item(catalog["inspection"])] * 2})
    assert dup.status_code == 422
    assert client.delete(f"/api/custom-plans/{plan['id']}", headers=own).status_code == 204


def test_saved_plan_shows_current_prices(client, db, catalog, people):
    own = headers(people["customer"])
    plan = client.post("/api/custom-plans", headers=own, json={"items": [item(catalog["inspection"])]}).json()
    with SessionLocal() as s:
        s.get(HvacService, catalog["inspection"]).price = Decimal("45.00")
        s.commit()
    assert client.get(f"/api/custom-plans/{plan['id']}", headers=own).json()["quote"]["subtotal"] == "45.00"


# --- Checkout --------------------------------------------------------------------------


def test_single_service_checkout_ignores_client_prices(client, catalog, people, area_tech):
    body = checkout_body([item(catalog["inspection"])], total="0.01", price="0.01")
    r = client.post("/api/orders", json=body, headers=headers(people["customer"]))
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["total"] == "40.00"
    assert order["status"] == "PENDING_CONFIRMATION"
    assert order["payment_method"] == "PAY_ON_SERVICE" and order["payment_status"] == "PENDING"
    assert order["items"][0]["service_name"] == "AC Inspection"


def test_plan_checkout_and_cart_clearing(client, catalog, people, area_tech):
    own = headers(people["customer"])
    items = [item(catalog["inspection"]), item(catalog["servicing"]), item(catalog["filter"])]
    plan = client.post("/api/custom-plans", headers=own, json={"items": items}).json()
    client.put("/api/cart", headers=own, json={"items": items})
    r = client.post("/api/orders", headers=own, json=checkout_body(items, custom_plan_id=plan["id"], from_cart=True))
    assert r.status_code == 201
    assert r.json()["subtotal"] == "145.00" and r.json()["custom_plan_id"] == plan["id"]
    assert len(r.json()["items"]) == 3
    assert client.get("/api/cart", headers=own).json()["items"] == []
    # The saved plan itself is kept for next time.
    assert client.get(f"/api/custom-plans/{plan['id']}", headers=own).status_code == 200


def test_checkout_is_idempotent(client, catalog, people, area_tech):
    own = headers(people["customer"])
    body = checkout_body([item(catalog["inspection"])])
    first = client.post("/api/orders", json=body, headers=own)
    second = client.post("/api/orders", json=body, headers=own)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    with SessionLocal() as s:
        assert s.query(ServiceOrder).count() == 1


def test_order_prices_are_frozen(client, catalog, people, area_tech):
    own = headers(people["customer"])
    order = client.post("/api/orders", json=checkout_body([item(catalog["servicing"])]), headers=own).json()
    with SessionLocal() as s:
        s.get(HvacService, catalog["servicing"]).price = Decimal("999.00")
        s.commit()
    again = client.get(f"/api/orders/{order['id']}", headers=own).json()
    assert again["total"] == "80.00" and again["items"][0]["unit_price"] == "80.00"


def test_checkout_rejects_inactive_or_invalid(client, catalog, people, area_tech):
    own = headers(people["customer"])
    r = client.post("/api/orders", json=checkout_body([item(catalog["retired"])]), headers=own)
    assert r.status_code == 409 and "no longer available" in r.json()["detail"]
    r = client.post("/api/orders", json=checkout_body([item(catalog["texas"])]), headers=own)
    assert r.status_code == 409
    r = client.post("/api/orders", json=checkout_body([item(catalog["inspection"])], discount_code="FAKE"), headers=own)
    assert r.status_code == 409
    assert client.post("/api/orders", json=checkout_body([item(catalog["inspection"])], address=None), headers=own).status_code == 422


def test_checkout_requires_available_slot(client, catalog, people):
    own = headers(people["customer"])
    # No technician serves Florida yet.
    r = client.post("/api/orders", json=checkout_body([item(catalog["inspection"])]), headers=own)
    assert r.status_code == 409 and "technicians" in r.json()["detail"]


def test_past_or_far_dates_rejected(client, catalog, people, area_tech):
    own = headers(people["customer"])
    for offset in (-2, 0, 90):
        body = checkout_body([item(catalog["inspection"])], requested_date=(date.today() + timedelta(days=offset)).isoformat())
        assert client.post("/api/orders", json=body, headers=own).status_code == 400


def test_discount_usage_counted_at_checkout(client, db, catalog, people, area_tech):
    db.add(DiscountCode(code="ONCE", discount_type=DiscountType.PERCENT, value=Decimal("10"), max_uses=1))
    db.commit()
    own = headers(people["customer"])
    r = client.post("/api/orders", json=checkout_body([item(catalog["inspection"])], discount_code="once"), headers=own)
    assert r.status_code == 201 and r.json()["discount_amount"] == "4.00" and r.json()["total"] == "36.00"
    r = client.post("/api/orders", json=checkout_body([item(catalog["inspection"])], discount_code="ONCE"), headers=own)
    assert r.status_code == 409


def test_ac_unit_address_used(client, catalog, people, area_tech):
    from tests.conftest import register_unit

    unit = register_unit(client, people["customer"])
    body = checkout_body([item(catalog["inspection"])], ac_unit_id=unit["id"], address=None, city=None, state=None, zip_code=None)
    r = client.post("/api/orders", json=body, headers=headers(people["customer"]))
    assert r.status_code == 201 and r.json()["ac_unit_id"] == unit["id"] and r.json()["address"] == "1 Main St"
    other_body = checkout_body([item(catalog["inspection"])], ac_unit_id=unit["id"])
    assert client.post("/api/orders", json=other_body, headers=headers(people["other"])).status_code == 404


# --- Ownership and lifecycle ----------------------------------------------------------


def place(client, catalog, people, items=None):
    r = client.post("/api/orders", json=checkout_body(items or [item(catalog["inspection"])]), headers=headers(people["customer"]))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_customers_only_see_their_orders(client, catalog, people, area_tech):
    order_id = place(client, catalog, people)
    assert client.get(f"/api/orders/{order_id}", headers=headers(people["other"])).status_code == 404
    assert client.get("/api/orders/me", headers=headers(people["other"])).json() == []
    assert [o["id"] for o in client.get("/api/orders/me", headers=headers(people["customer"])).json()] == [order_id]
    assert client.get("/api/orders", headers=headers(people["customer"])).status_code == 403


def test_full_order_lifecycle(client, catalog, people, area_tech):
    admin, tech, customer = headers(people["admin"]), headers(area_tech), headers(people["customer"])
    order_id = place(client, catalog, people)

    assert client.post(f"/api/orders/{order_id}/confirm", headers=customer).status_code == 403
    assert client.post(f"/api/orders/{order_id}/appointment", headers=admin, json={
        "technician_id": area_tech.id, "date": (date.today() + timedelta(days=5)).isoformat(), "start_time": "09:00",
    }).status_code == 409  # must confirm first
    assert client.post(f"/api/orders/{order_id}/confirm", headers=admin).json()["status"] == "CONFIRMED"

    techs = client.get(f"/api/orders/{order_id}/eligible-technicians", headers=admin).json()
    assert [t["id"] for t in techs] == [area_tech.id] and techs[0]["free_in_requested_window"]
    r = client.post(f"/api/orders/{order_id}/appointment", headers=admin, json={
        "technician_id": area_tech.id, "date": (date.today() + timedelta(days=5)).isoformat(), "start_time": "09:00",
        "duration_minutes": 60,
    })
    assert r.json()["status"] == "SCHEDULED" and r.json()["appointment"]["status"] == "CONFIRMED"
    assert r.json()["technician"]["id"] == area_tech.id

    assert client.post(f"/api/orders/{order_id}/cancel", headers=customer, json={}).status_code == 403
    assert client.post(f"/api/orders/{order_id}/mark-paid", headers=admin).status_code == 409
    assert [o["id"] for o in client.get("/api/orders/assigned", headers=tech).json()] == [order_id]
    assert client.post(f"/api/orders/{order_id}/start", headers=tech).json()["status"] == "IN_PROGRESS"
    assert client.post(f"/api/orders/{order_id}/complete", headers=tech).json()["status"] == "COMPLETED"
    paid = client.post(f"/api/orders/{order_id}/mark-paid", headers=admin).json()
    assert paid["payment_status"] == "PAID" and paid["paid_at"]
    assert client.post(f"/api/orders/{order_id}/mark-paid", headers=admin).status_code == 409


def test_estimate_needs_final_price_before_payment(client, catalog, people, area_tech):
    admin = headers(people["admin"])
    order_id = place(client, catalog, people, [item(catalog["repair"]), item(catalog["inspection"])])
    order = client.get(f"/api/orders/{order_id}", headers=admin).json()
    assert order["total_is_estimate"] is True
    with SessionLocal() as s:
        o = s.get(ServiceOrder, order_id)
        o.status = o.status.__class__.COMPLETED
        s.commit()
    assert client.post(f"/api/orders/{order_id}/mark-paid", headers=admin).status_code == 409
    repair_item = next(i for i in order["items"] if i["is_estimate"])
    fixed_item = next(i for i in order["items"] if not i["is_estimate"])
    assert client.put(f"/api/orders/{order_id}/final-prices", headers=admin,
                      json={"prices": [{"item_id": fixed_item["id"], "unit_price": "1.00"}]}).status_code == 409
    r = client.put(f"/api/orders/{order_id}/final-prices", headers=admin,
                   json={"prices": [{"item_id": repair_item["id"], "unit_price": "180.00"}]})
    assert r.json()["total"] == "220.00" and r.json()["total_is_estimate"] is False
    assert client.post(f"/api/orders/{order_id}/mark-paid", headers=admin).json()["payment_status"] == "PAID"


def test_customer_cancel_and_reschedule(client, catalog, people, area_tech):
    customer = headers(people["customer"])
    order_id = place(client, catalog, people)
    new_day = (date.today() + timedelta(days=7)).isoformat()
    r = client.post(f"/api/orders/{order_id}/reschedule", headers=customer, json={"requested_date": new_day, "requested_window": "EVENING"})
    assert r.json()["requested_date"] == new_day and r.json()["requested_window"] == "EVENING"
    assert client.post(f"/api/orders/{order_id}/reschedule", headers=headers(people["other"]),
                       json={"requested_date": new_day, "requested_window": "EVENING"}).status_code == 404
    r = client.post(f"/api/orders/{order_id}/cancel", headers=customer, json={"note": "Changed my mind"})
    assert r.json()["status"] == "CANCELLED" and r.json()["payment_status"] == "VOID"


def test_technician_booked_window_is_not_offered(client, catalog, people, area_tech):
    admin = headers(people["admin"])
    first = place(client, catalog, people)
    client.post(f"/api/orders/{first}/confirm", headers=admin)
    day = (date.today() + timedelta(days=5)).isoformat()
    client.post(f"/api/orders/{first}/appointment", headers=admin, json={
        "technician_id": area_tech.id, "date": day, "start_time": "08:00", "duration_minutes": 240})
    slots = client.get("/api/catalog/availability?state=FL&zip_code=33101&days=7").json()
    morning = next(s for s in slots if s["date"] == day and s["window"] == "MORNING")
    assert morning["available"] is False
    r = client.post("/api/orders", json=checkout_body([item(catalog["inspection"])]), headers=headers(people["customer"]))
    assert r.status_code == 409 and "no longer available" in r.json()["detail"]


def test_claim_and_order_share_technician_calendar(client, catalog, people, area_tech):
    """A visit booked for an order blocks the same technician for a claim (one appointments table)."""
    from tests.conftest import register_unit

    admin = headers(people["admin"])
    order_id = place(client, catalog, people)
    client.post(f"/api/orders/{order_id}/confirm", headers=admin)
    day = (date.today() + timedelta(days=5)).isoformat()
    client.post(f"/api/orders/{order_id}/appointment", headers=admin, json={
        "technician_id": area_tech.id, "date": day, "start_time": "09:00", "duration_minutes": 120})

    unit = register_unit(client, people["customer"])
    claim = client.post("/api/service-requests", headers=headers(people["customer"]), json={
        "ac_unit_id": unit["id"], "service_type": "NOT_COOLING", "description": "Blowing warm air"}).json()["id"]
    client.post(f"/api/service-requests/{claim}/review", headers=admin, json={})
    client.post(f"/api/service-requests/{claim}/approve", headers=admin, json={})
    r = client.post(f"/api/service-requests/{claim}/appointment", headers=admin, json={
        "technician_id": area_tech.id, "date": day, "start_time": "10:00", "duration_minutes": 60})
    assert r.status_code == 409


# --- Admin catalog management -----------------------------------------------------------


def test_admin_changes_price_and_customers_cannot(client, catalog, people):
    admin, customer = headers(people["admin"]), headers(people["customer"])
    current = client.get("/api/catalog/services/ac-inspection").json()
    body = {k: current[k] for k in ("name", "description", "icon", "pricing_type", "max_quantity",
                                    "duration_minutes", "allowed_frequencies", "available_states", "is_active", "display_order")}
    body |= {"category_id": current["category"]["id"], "price": "42.50", "addons": []}
    assert client.put(f"/api/catalog/admin/services/{current['id']}", json=body, headers=customer).status_code == 403
    r = client.put(f"/api/catalog/admin/services/{current['id']}", json=body, headers=admin)
    assert r.status_code == 200 and r.json()["price"] == "42.50"
    assert quote(client, [item(current["id"])])["total"] == "42.50"
    assert client.put(f"/api/catalog/admin/services/{current['id']}", json=body | {"price": "-1"}, headers=admin).status_code == 422


def test_admin_creates_category_service_and_discount(client, people):
    admin = headers(people["admin"])
    cat = client.post("/api/catalog/admin/categories", headers=admin, json={"name": "Emergency"}).json()
    r = client.post("/api/catalog/admin/services", headers=admin, json={
        "category_id": cat["id"], "name": "Night Call-out", "pricing_type": "STARTING_AT", "price": "150",
        "allowed_frequencies": ["ONE_TIME"], "addons": [{"name": "Weekend surcharge", "price": "50"}]})
    assert r.status_code == 201 and r.json()["requires_inspection"] is True and r.json()["slug"] == "night-call-out"
    d = client.post("/api/catalog/admin/discounts", headers=admin, json={"code": "spring15", "discount_type": "PERCENT", "value": "15"})
    assert d.status_code == 201 and d.json()["code"] == "SPRING15"
    assert client.post("/api/catalog/admin/discounts", headers=admin,
                       json={"code": "TOOBIG", "discount_type": "PERCENT", "value": "150"}).status_code == 422


def test_seed_catalog_is_idempotent(db):
    import seed_catalog

    seed_catalog.main()
    with SessionLocal() as s:
        first = s.query(HvacService).count()
        price = s.query(HvacService).filter_by(slug="ac-inspection").one()
        price.price = Decimal("49.00")  # an admin edit
        s.commit()
    seed_catalog.main()
    with SessionLocal() as s:
        assert s.query(HvacService).count() == first
        assert s.query(HvacService).filter_by(slug="ac-inspection").one().price == Decimal("49.00")
        assert s.query(ServiceCategory).count() == 7
