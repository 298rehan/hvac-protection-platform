"use client";

import Link from "next/link";
import { useState } from "react";

import { ClipboardIcon } from "@/components/icons";
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatPrice } from "@/lib/marketplace-format";
import { useFetch } from "@/lib/use-fetch";
import { deletePlan, fetchPlans } from "@/services/marketplaceService";

export default function SavedPlansPage() {
  const plans = useFetch("saved-plans", fetchPlans);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(planId: number, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(planId);
    setError(null);
    try {
      await deletePlan(planId);
      plans.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  const list = plans.data ?? plans.staleData ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Saved plans"
        description="Draft custom plans you can edit or check out. Prices are always shown at today's rates."
        actions={<ButtonLink href="/dashboard/custom-plan">New custom plan</ButtonLink>}
      />
      {error ? <Alert>{error}</Alert> : null}
      {plans.error ? <Alert>{plans.error}</Alert> : null}
      {plans.loading && list.length === 0 ? <PageLoader label="Loading plans" /> : null}
      {!plans.loading && list.length === 0 && !plans.error ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title="No saved plans yet"
          description="Build a plan from the services you need and save it as a draft."
          action={<ButtonLink href="/dashboard/custom-plan">Build a plan</ButtonLink>}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((plan) => (
          <Card key={plan.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  <Link href={`/dashboard/custom-plan/${plan.id}`} className="hover:underline">{plan.name}</Link>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Updated {formatDate(plan.updated_at)} · {plan.items.length} service{plan.items.length === 1 ? "" : "s"}</p>
              </div>
              {plan.quote ? (
                <p className="text-right">
                  <span className="block text-lg font-bold text-slate-900">{formatPrice(plan.quote.total, plan.quote.currency)}</span>
                  {plan.quote.total_is_estimate ? <span className="text-xs text-amber-700">estimate</span> : null}
                </p>
              ) : null}
            </div>
            {plan.quote ? (
              <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-600">
                {plan.quote.lines.map((line) => <li key={line.service_id}>{line.quantity} × {line.service_name}</li>)}
              </ul>
            ) : <p className="mt-3 flex-1 text-sm text-slate-500">No services yet.</p>}
            {plan.quote && plan.quote.problems.length > 0 ? (
              <p className="mt-2 text-xs text-rose-600">Some services in this plan need attention before checkout.</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href={`/dashboard/custom-plan/${plan.id}`} size="sm" variant="secondary">Edit</ButtonLink>
              {plan.items.length > 0 ? <ButtonLink href={`/checkout/services?plan=${plan.id}`} size="sm">Checkout</ButtonLink> : null}
              <Button size="sm" variant="ghost" onClick={() => remove(plan.id, plan.name)} disabled={deleting === plan.id}>
                {deleting === plan.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
