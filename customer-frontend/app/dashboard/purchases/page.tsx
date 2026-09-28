"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  Alert,
  ButtonLink,
  Card,
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
  formatMoney,
  STATUS_DESCRIPTIONS,
} from "@/lib/format";
import { fetchMyPurchases } from "@/services/purchaseService";
import type { Purchase } from "@/types";

export default function MyPurchasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      }
    >
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your purchases" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          My Purchases
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Every enrollment on your account, including past and cancelled coverage.
        </p>
      </header>

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
          title="No purchases yet"
          description="When you enroll in a protection plan it will show up here."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      ) : (
        <div className="space-y-4">
          {purchases.map((purchase) => (
            <Card key={purchase.id} id={`purchase-${purchase.id}`} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
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

              <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
                <DetailRow label="Price">
                  {formatMoney(purchase.price)}
                  <span className="ml-1 font-normal text-slate-500">
                    {cycleSuffix(purchase.billing_cycle)}
                  </span>
                </DetailRow>
                <DetailRow label="Billing">
                  {cycleLabel(purchase.billing_cycle)}
                </DetailRow>
                <DetailRow label="Service region">{purchase.state_code}</DetailRow>
                <DetailRow label="Purchase date">
                  {formatDate(purchase.created_at)}
                </DetailRow>
                <DetailRow label="Activated">
                  {formatDate(purchase.activated_at)}
                </DetailRow>
                <DetailRow label="Expires">{formatDate(purchase.expires_at)}</DetailRow>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
