"use client";

import { useParams } from "next/navigation";

import { PlanBuilder } from "@/components/marketplace/plan-builder";
import { Alert, BackLink, PageHeader, PageLoader } from "@/components/ui";
import { useFetch } from "@/lib/use-fetch";
import { fetchPlanById } from "@/services/marketplaceService";

export default function SavedPlanPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useFetch(`plan-${id}`, () => fetchPlanById(Number(id)));

  return (
    <div className="space-y-8">
      <BackLink href="/dashboard/plans">Saved plans</BackLink>
      <PageHeader title={plan.data?.name ?? "Custom plan"} description="Edit your plan, save the draft, or check out." />
      {plan.loading ? <PageLoader label="Loading plan" /> : null}
      {plan.error ? <Alert>{plan.error}</Alert> : null}
      {plan.data ? <PlanBuilder key={plan.data.id} plan={plan.data} initialItems={plan.data.items} /> : null}
    </div>
  );
}
