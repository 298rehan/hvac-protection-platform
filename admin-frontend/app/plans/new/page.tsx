"use client";

import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { PlanForm } from "@/components/plan-form";

export default function NewPlanPage() {
  return (
    <AdminShell>
      <div className="space-y-6">
        <Link href="/plans" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          &larr; Back to plans
        </Link>
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create a plan
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Assign the plan to one or more states and set the price for each. Active plans
            with an available region show up on the customer site right away.
          </p>
        </header>
        <PlanForm />
      </div>
    </AdminShell>
  );
}
