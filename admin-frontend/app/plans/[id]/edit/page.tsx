"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { PlanForm } from "@/components/plan-form";
import { Alert, Spinner } from "@/components/ui";
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading plan" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <Link
        href={`/plans/${plan.id}`}
        className="text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        &larr; Back to plan
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Edit {plan.name}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Price changes apply to new enrollments only. Existing purchases keep the price
          the customer agreed to.
        </p>
      </header>
      <PlanForm plan={plan} />
    </div>
  );
}
