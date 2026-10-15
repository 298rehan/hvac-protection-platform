"""Add the starter HVAC service catalog. Safe to run on every deploy.

    python seed_catalog.py

Insert-only and keyed by slug: a category or service that already exists is
left exactly as it is, so admin edits (prices, descriptions, active flags) are
never overwritten and running it twice creates no duplicates.

Prices are ILLUSTRATIVE DEMO PRICES, not market rates. Change them in
Admin -> Services.
"""

from __future__ import annotations

import sys
from decimal import Decimal

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import HvacService, PricingType, ServiceAddon, ServiceCategory

ONE, MON, QTR, YR = "ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY"

CATEGORIES = [
    ("inspection-diagnostics", "AC Inspection & Diagnostics", "snowflake", "Find out what your system needs before anything is replaced."),
    ("servicing-cleaning", "AC Servicing & Cleaning", "sparkles", "Tune-ups and cleaning that keep efficiency up and bills down."),
    ("hvac-maintenance", "HVAC Maintenance", "wrench", "Scheduled care for the whole heating and cooling system."),
    ("repair-services", "Repair Services", "bolt", "Fault finding and repair, priced after diagnosis."),
    ("parts-replacement", "Parts & Replacement", "layers", "Common replacement parts, fitted by a technician."),
    ("installation", "Installation & Replacement", "home", "Advice and quotes for new or replacement systems."),
    ("emergency", "Emergency Services", "alert", "Priority call-outs when your system fails."),
]

# (slug, category_slug, name, description, pricing, price, unit_label, max_qty, minutes, frequencies, addons)
SERVICES = [
    ("ac-inspection", "inspection-diagnostics", "AC Inspection",
     "A licensed technician checks airflow, electrical connections, thermostat, refrigerant pressure and drainage, and gives you a written report.",
     PricingType.FIXED, "40.00", None, 3, 45, [ONE, YR], []),
    ("refrigerant-leak-inspection", "inspection-diagnostics", "Refrigerant & Leak Inspection",
     "Electronic leak detection and pressure test. Any recharge or repair is quoted separately after the inspection.",
     PricingType.FIXED, "55.00", None, 1, 60, [ONE], []),
    ("ac-servicing", "servicing-cleaning", "AC Servicing",
     "Full tune-up: clean filters and drain line, check refrigerant, tighten electrical connections and test cooling performance.",
     PricingType.FIXED, "80.00", None, 3, 90, [ONE, QTR, YR], [("Coil cleaning", "35.00"), ("Drain line flush", "20.00")]),
    ("coil-cleaning", "servicing-cleaning", "Coil Cleaning",
     "Deep cleaning of evaporator and condenser coils to restore airflow and efficiency.",
     PricingType.FIXED, "60.00", None, 2, 60, [ONE, YR], []),
    ("filter-replacement", "parts-replacement", "Air Filter Replacement",
     "Supply and fit standard 1-inch pleated filters. Priced per filter.",
     PricingType.PER_UNIT, "25.00", "filter", 6, 15, [ONE, MON, QTR], []),
    ("hvac-system-maintenance", "hvac-maintenance", "HVAC System Maintenance",
     "Seasonal maintenance for heating and cooling: burner/heat-pump check, blower, belts, safety controls and thermostat calibration.",
     PricingType.FIXED, "120.00", None, 2, 120, [ONE, QTR, YR], [("Duct inspection", "45.00")]),
    ("ac-repair", "repair-services", "AC Repair",
     "Diagnosis and repair of common faults. The starting price covers the call-out and diagnosis; parts and labour are confirmed after inspection.",
     PricingType.STARTING_AT, "95.00", None, 1, 120, [ONE], []),
    ("emergency-repair", "emergency", "Emergency Repair Call-out",
     "Priority technician dispatch for a system that has stopped working. Final repair price is confirmed on site.",
     PricingType.STARTING_AT, "150.00", None, 1, 120, [ONE], []),
    ("installation-consultation", "installation", "Installation or Replacement Consultation",
     "A technician sizes your home, reviews your current equipment and gives you a written quote for a new system.",
     PricingType.FIXED, "0.00", None, 1, 60, [ONE], []),
]


def main() -> int:
    created_categories = created_services = 0
    with SessionLocal() as db:
        categories = {c.slug: c for c in db.execute(select(ServiceCategory)).scalars()}
        for order, (slug, name, icon, description) in enumerate(CATEGORIES, start=1):
            if slug in categories:
                continue
            category = ServiceCategory(slug=slug, name=name, icon=icon, description=description, display_order=order)
            db.add(category)
            categories[slug] = category
            created_categories += 1
        db.flush()

        existing = set(db.execute(select(HvacService.slug)).scalars())
        for order, (slug, cat, name, description, pricing, price, unit, max_qty, minutes, freqs, addons) in enumerate(SERVICES, start=1):
            if slug in existing:
                continue
            service = HvacService(
                slug=slug, category_id=categories[cat].id, name=name, description=description,
                icon=categories[cat].icon, pricing_type=pricing, price=Decimal(price), unit_label=unit,
                max_quantity=max_qty, duration_minutes=minutes, allowed_frequencies=freqs,
                available_states=None, display_order=order,
            )
            service.addons = [ServiceAddon(name=n, price=Decimal(p)) for n, p in addons]
            db.add(service)
            created_services += 1
        db.commit()
    print(f"Catalog seed: {created_categories} categories and {created_services} services added "
          f"(existing ones left unchanged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
