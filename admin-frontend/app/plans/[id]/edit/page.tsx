"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { PlanForm } from "@/components/plan-form";
import { Alert, BackLink, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { fetchPlan } from "@/services/adminService";
import type { Plan } from "@/types";

export default function EditPlanPage() {
  return (
    <AdminShell>
      <EditPlan />
    </AdminShell>
  );
}

function EditPlan() {
  const params = useParams<{ id: string }>();
  const planId = Number(params.id);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(planId)) {
      setError("Invalid plan id.");
      setLoading(false);
      return;
    }
    fetchPlan(planId)
      .then(setPlan)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) return <PageLoader label="Loading plan" />;

  if (error) return <Alert>{error}</Alert>;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <BackLink href={`/plans/${plan.id}`}>Back to plan</BackLink>
      <PageHeader
        title={`Edit ${plan.name}`}
        description="Price changes apply to new enrollments only. Existing purchases keep the price the customer agreed to."
      />
      <PlanForm plan={plan} />
    </div>
  );
}
