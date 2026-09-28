"use client";

import { PlanCatalogue } from "@/components/plan-catalogue";

/** The homepage shows the same live catalogue, capped at three plans. */
export function HomePlanPreview() {
  return <PlanCatalogue compact />;
}
