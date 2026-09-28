"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
import { fetchDashboard } from "@/services/purchaseService";
import type { CustomerDashboard } from "@/types";

export default function DashboardPage() {
  const [data, setData] = useState<CustomerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your dashboard" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const current = data.active_plan ?? data.pending_plan;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Welcome back, {data.customer_name.split(" ")[0]}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {data.state_name ? (
            <>
              Service region: <strong>{data.state_name}</strong> &middot;{" "}
            </>
          ) : null}
          Member since {formatDate(data.member_since)}
        </p>
      </header>

      {current ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {data.active_plan ? "Current plan" : "Pending enrollment"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {current.plan.name}
                </h2>
              </div>
              <StatusBadge status={current.status} />
            </div>
          </div>

          <div className="grid gap-8 px-6 py-6 lg:grid-cols-3">
            <dl className="lg:col-span-2">
              <DetailRow label="Plan price">
                {formatMoney(current.price)}
                <span className="ml-1 font-normal text-slate-500">
                  {cycleSuffix(current.billing_cycle)}
                </span>
              </DetailRow>
              <DetailRow label="Billing">{cycleLabel(current.billing_cycle)}</DetailRow>
              <DetailRow label="Service region">{current.state_code}</DetailRow>
              <DetailRow label="Status">
                {current.status} &mdash;{" "}
                <span className="font-normal text-slate-500">
                  {STATUS_DESCRIPTIONS[current.status]}
                </span>
              </DetailRow>
              <DetailRow label="Purchase date">{formatDate(current.created_at)}</DetailRow>
              <DetailRow label="Activated">{formatDate(current.activated_at)}</DetailRow>
              <DetailRow label="Expiration date">
                {formatDate(current.expires_at)}
              </DetailRow>
            </dl>

            <div className="flex flex-col gap-3">
              <ButtonLink href="/dashboard/my-plan" className="w-full">
                View Plan
              </ButtonLink>
              <ButtonLink
                href="/dashboard/purchases"
                variant="secondary"
                className="w-full"
              >
                All purchases
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="You do not have a protection plan yet"
          description="Browse the plans available in your region and enroll in the coverage that fits your home."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent purchases</h2>
          <Link
            href="/dashboard/purchases"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all ({data.total_purchases})
          </Link>
        </div>

        {data.recent_purchases.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No purchases yet" />
          </div>
        ) : (
          <Card className="mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Reference</Th>
                    <Th>Plan</Th>
                    <Th>Price</Th>
                    <Th>Region</Th>
                    <Th>Purchased</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent_purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/dashboard/purchases#purchase-${purchase.id}`}
                          className="font-semibold text-brand-600 hover:text-brand-700"
                        >
                          #{purchase.id}
                        </Link>
                      </Td>
                      <Td>{purchase.plan.name}</Td>
                      <Td>
                        {formatMoney(purchase.price)}
                        <span className="text-slate-500">
                          {cycleSuffix(purchase.billing_cycle)}
                        </span>
                      </Td>
                      <Td>{purchase.state_code}</Td>
                      <Td>{formatDate(purchase.created_at)}</Td>
                      <Td>
                        <StatusBadge status={purchase.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td>;
}
