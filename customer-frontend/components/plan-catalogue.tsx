"use client";

import { useEffect, useState } from "react";

import { MapPinIcon } from "@/components/icons";
import { PlanCard, PlanCardSkeleton } from "@/components/plan-card";
import { RegionSelect } from "@/components/region-select";
import { Alert, EmptyState } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useRegion } from "@/lib/use-region";
import { fetchPlans } from "@/services/planService";
import type { PublicPlan } from "@/types";

/**
 * The plan grid, driven entirely by the API.
 *
 * A plan an admin creates and marks available in this state appears here on the
 * next load with no frontend change.
 */
export function PlanCatalogue({ compact = false }: { compact?: boolean }) {
  const { region, serviceAreas, locked, loading: regionLoading, setRegion } = useRegion();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!region) {
      if (!regionLoading) setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPlans(region)
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [region, regionLoading]);

  const visible = compact ? plans.slice(0, 3) : plans;

  return (
    <div>
      <RegionSelect
        value={region}
        regions={serviceAreas}
        locked={locked}
        onChange={setRegion}
      />

      <div className="mt-10">
        {loading || regionLoading ? (
          <div
            role="status"
            aria-label="Loading plans for your region"
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((slot) => (
              <PlanCardSkeleton key={slot} />
            ))}
          </div>
        ) : error ? (
          <Alert>{error}</Alert>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MapPinIcon />}
            title="No plans available in this region yet"
            description="We are not currently selling protection plans in the selected state. Try another region, or check back soon."
          />
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:gap-6">
            {visible.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                featured={visible.length === 3 && index === 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
