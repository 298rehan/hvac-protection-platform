"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  ButtonLink,
  Card,
  CheckIcon,
  DetailRow,
  EmptyState,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import {
  cycleLabel,
  cycleSuffix,
  formatDate,
  formatDateTime,
  formatMoney,
  STATUS_DESCRIPTIONS,
} from "@/lib/format";
import { fetchDashboard, fetchPurchase } from "@/services/purchaseService";
import type { PurchaseDetail } from "@/types";

/** Shows the customer's current coverage, active or awaiting approval. */
export default function MyPlanPage() {
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDashboard()
      .then(async (dashboard) => {
        const current = dashboard.active_plan ?? dashboard.pending_plan;
        if (!current) return null;
        return fetchPurchase(current.id);
      })
      .then((detail) => {
        if (!cancelled) setPurchase(detail);
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
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your plan" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;

  if (!purchase) {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Plan</h1>
        <div className="mt-6">
          <EmptyState
            title="No active protection plan"
            description="Once you enroll in a plan it will appear here with your coverage dates and everything it includes."
            action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
          />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {purchase.plan.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {STATUS_DESCRIPTIONS[purchase.status]}
          </p>
        </div>
        <StatusBadge status={purchase.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Coverage details</h2>
          <dl className="mt-4">
            <DetailRow label="Reference">#{purchase.id}</DetailRow>
            <DetailRow label="Plan price">
              {formatMoney(purchase.price)}
              <span className="ml-1 font-normal text-slate-500">
                {cycleSuffix(purchase.billing_cycle)}
              </span>
            </DetailRow>
            <DetailRow label="Billing">{cycleLabel(purchase.billing_cycle)}</DetailRow>
            <DetailRow label="Service region">{purchase.state_code}</DetailRow>
            <DetailRow label="Purchase date">{formatDate(purchase.created_at)}</DetailRow>
            <DetailRow label="Activated">{formatDate(purchase.activated_at)}</DetailRow>
            <DetailRow label="Expiration date">
              {formatDate(purchase.expires_at)}
            </DetailRow>
          </dl>

          <h2 className="mt-8 text-base font-semibold text-slate-900">Status history</h2>
          <ol className="mt-4 space-y-4">
            {purchase.status_history.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {entry.from_status
                      ? `${entry.from_status} to ${entry.to_status}`
                      : `Enrollment created (${entry.to_status})`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(entry.created_at)}
                  </p>
                  {entry.note ? (
                    <p className="mt-1 text-sm text-slate-600">{entry.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-base font-semibold text-slate-900">What is covered</h2>
          <ul className="mt-4 space-y-3">
            {purchase.plan.features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-slate-700">
                <CheckIcon className="text-brand-600" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-600">
            {purchase.plan.description}
          </p>
          <ButtonLink href="/plans" variant="secondary" className="mt-6 w-full">
            Compare other plans
          </ButtonLink>
        </Card>
      </div>
    </div>
  );
}
