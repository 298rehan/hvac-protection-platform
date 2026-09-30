"use client";

import { useEffect, useState } from "react";

import { ShieldIcon } from "@/components/icons";
import {
  Alert,
  ButtonLink,
  Card,
  CardHeader,
  CheckIcon,
  DetailRow,
  EmptyState,
  PageHeader,
  PageLoader,
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
  STATUS_LABELS,
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

  if (loading) return <PageLoader label="Loading your plan" />;

  if (error) return <Alert>{error}</Alert>;

  if (!purchase) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Plan" description="Your current protection plan and coverage." />
        <EmptyState
          icon={<ShieldIcon />}
          title="No active protection plan"
          description="Once you enroll in a plan it will appear here with your coverage dates and everything it includes."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {purchase.plan.name}
            <StatusBadge status={purchase.status} />
          </span>
        }
        description={STATUS_DESCRIPTIONS[purchase.status]}
        actions={
          <ButtonLink href="/plans" variant="secondary">
            Compare other plans
          </ButtonLink>
        }
      />

      {purchase.status === "PENDING" ? (
        <Alert tone="info">
          Your enrollment is being reviewed by our service team. Coverage dates will appear
          here as soon as it is approved.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Coverage details" description={`Reference #${purchase.id}`} />
            <dl className="px-5 py-2 sm:px-6">
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
          </Card>

          <Card>
            <CardHeader title="Status history" />
            <ol className="px-5 py-5 sm:px-6">
              {purchase.status_history.map((entry, index) => {
                const last = index === purchase.status_history.length - 1;
                return (
                  <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last ? (
                      <span
                        aria-hidden
                        className="absolute top-6 bottom-0 left-[11px] w-px bg-slate-200"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-200"
                    >
                      <span className="h-2 w-2 rounded-full bg-brand-500" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-medium text-slate-900">
                        {entry.from_status
                          ? `${STATUS_LABELS[entry.from_status]} to ${STATUS_LABELS[entry.to_status]}`
                          : `Enrollment created (${STATUS_LABELS[entry.to_status]})`}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(entry.created_at)}
                      </p>
                      {entry.note ? (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-100">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader title="What is covered" />
          <div className="px-5 py-5 sm:px-6">
            <ul className="space-y-3">
              {purchase.plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-sm text-slate-700">
                  <CheckIcon className="mt-px h-4.5 w-4.5 text-brand-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-600">
              {purchase.plan.description}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
