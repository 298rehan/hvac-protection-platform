"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ReceiptIcon } from "@/components/icons";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  StatusBadge,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import {
  cx,
  cycleLabel,
  cycleSuffix,
  formatDate,
  formatMoney,
  STATUS_DESCRIPTIONS,
} from "@/lib/format";
import { fetchMyPurchases } from "@/services/purchaseService";
import type { Purchase } from "@/types";

export default function MyPurchasesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PurchaseList />
    </Suspense>
  );
}

function PurchaseList() {
  const searchParams = useSearchParams();
  const submittedId = searchParams.get("submitted");

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyPurchases()
      .then(setPurchases)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader label="Loading your purchases" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Purchases"
        description="Every enrollment on your account, including past and cancelled coverage."
        actions={
          purchases.length > 0 ? (
            <ButtonLink href="/plans" variant="secondary">
              Browse plans
            </ButtonLink>
          ) : null
        }
      />

      {submittedId ? (
        <Alert tone="success">
          Enrollment <strong>#{submittedId}</strong> was submitted. It is now pending
          review by our service team, and you will receive an email once your coverage is
          active.
        </Alert>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {purchases.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon />}
          title="No purchases yet"
          description="When you enroll in a protection plan it will show up here."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      ) : (
        <div className="space-y-4">
          {purchases.map((purchase) => (
            <Card
              key={purchase.id}
              id={`purchase-${purchase.id}`}
              className={cx(
                "scroll-mt-24 overflow-hidden",
                String(purchase.id) === submittedId && "ring-2 ring-emerald-300",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Reference #{purchase.id}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    {purchase.plan.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {STATUS_DESCRIPTIONS[purchase.status]}
                  </p>
                </div>
                <StatusBadge status={purchase.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
                <Fact label="Price">
                  {formatMoney(purchase.price)}
                  <span className="font-normal text-slate-500">
                    {cycleSuffix(purchase.billing_cycle)}
                  </span>
                </Fact>
                <Fact label="Billing">{cycleLabel(purchase.billing_cycle)}</Fact>
                <Fact label="Service region">{purchase.state_code}</Fact>
                <Fact label="Purchase date">{formatDate(purchase.created_at)}</Fact>
                <Fact label="Activated">{formatDate(purchase.activated_at)}</Fact>
                <Fact label="Expires">{formatDate(purchase.expires_at)}</Fact>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{children}</dd>
    </div>
  );
}
