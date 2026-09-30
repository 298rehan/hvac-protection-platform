"use client";

import { AdminShell } from "@/components/admin-shell";
import { PlanForm } from "@/components/plan-form";
import { BackLink, PageHeader } from "@/components/ui";

export default function NewPlanPage() {
  return (
    <AdminShell>
      <div className="space-y-6">
        <BackLink href="/plans">Back to plans</BackLink>
        <PageHeader
          title="Create a plan"
          description="Assign the plan to one or more states and set the price for each. Active plans with an available region show up on the customer site right away."
        />
        <PlanForm />
      </div>
    </AdminShell>
  );
}
