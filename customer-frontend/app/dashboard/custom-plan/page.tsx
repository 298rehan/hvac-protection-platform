"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PlanBuilder } from "@/components/marketplace/plan-builder";
import { PageHeader, PageLoader } from "@/components/ui";
import { useFetch } from "@/lib/use-fetch";
import { defaultItem } from "@/lib/use-service-actions";
import { fetchService } from "@/services/marketplaceService";

function NewPlan() {
  const add = useSearchParams().get("add");
  // "Add to plan" from the catalog arrives as ?add=<serviceId>.
  const service = useFetch(add ? `add-${add}` : "none", () => (add ? fetchService(add) : Promise.resolve(null)));
  if (service.loading) return <PageLoader label="Loading" />;
  const initial = service.data ? [defaultItem(service.data)] : [];
  return <PlanBuilder key={service.data?.id ?? "empty"} initialItems={initial} />;
}

export default function CustomPlanPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Build a custom plan"
        description="Pick the services you need, choose how often, and see the price calculated by our server as you go."
      />
      <Suspense fallback={<PageLoader label="Loading" />}>
        <NewPlan />
      </Suspense>
    </div>
  );
}
