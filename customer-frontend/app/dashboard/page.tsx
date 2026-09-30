"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ArrowRightIcon,
  CalendarIcon,
  MapPinIcon,
  ReceiptIcon,
  ShieldIcon,
} from "@/components/icons";
import {
  Alert,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  StatTile,
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
  STATUS_LABELS,
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

  if (loading) return <DashboardSkeleton />;

  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const current = data.active_plan ?? data.pending_plan;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${data.customer_name.split(" ")[0]}`}
        description={
          <>
            {data.state_name ? (
              <>
                Service region: <strong className="font-semibold text-slate-800">{data.state_name}</strong>{" "}
                &middot;{" "}
              </>
            ) : null}
            Member since {formatDate(data.member_since)}
          </>
        }
        actions={
          <ButtonLink href="/plans" variant="secondary">
            Browse plans
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<ShieldIcon />}
          label="Coverage"
          value={
            current ? (
              <span className="flex items-center gap-2">
                {STATUS_LABELS[current.status]}
                <span
                  aria-hidden
                  className={cx(
                    "h-2 w-2 rounded-full",
                    current.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
              </span>
            ) : (
              "Not covered"
            )
          }
          hint={current ? current.plan.name : "No plan on file"}
        />
        <StatTile
          icon={<CalendarIcon />}
          label="Coverage ends"
          value={current ? formatDate(current.expires_at) : "—"}
          hint={current?.activated_at ? `Active since ${formatDate(current.activated_at)}` : "Starts once approved"}
        />
        <StatTile
          icon={<ReceiptIcon />}
          label="Purchases"
          value={<span className="tabular-nums">{data.total_purchases}</span>}
          hint="All enrollments on your account"
        />
        <StatTile
          icon={<MapPinIcon />}
          label="Service region"
          value={data.state_name ?? "Not set"}
          hint={data.state_code ? `Pricing for ${data.state_code}` : "Add an address in Profile"}
        />
      </div>

      {current ? (
        <Card className="overflow-hidden">
          <div
            className={cx(
              "flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6",
              data.active_plan
                ? "border-emerald-100 bg-emerald-50/50"
                : "border-amber-100 bg-amber-50/50",
            )}
          >
            <div className="flex items-start gap-4">
              <span
                className={cx(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1",
                  data.active_plan
                    ? "bg-white text-emerald-600 ring-emerald-200"
                    : "bg-white text-amber-600 ring-amber-200",
                )}
              >
                <ShieldIcon />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {data.active_plan ? "Current plan" : "Pending enrollment"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{current.plan.name}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {STATUS_DESCRIPTIONS[current.status]}
                </p>
              </div>
            </div>
            <StatusBadge status={current.status} />
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Fact label="Plan price">
                {formatMoney(current.price)}
                <span className="ml-0.5 text-sm font-normal text-slate-500">
                  {cycleSuffix(current.billing_cycle)}
                </span>
              </Fact>
              <Fact label="Billing">{cycleLabel(current.billing_cycle)}</Fact>
              <Fact label="Service region">{current.state_code}</Fact>
              <Fact label="Purchase date">{formatDate(current.created_at)}</Fact>
              <Fact label="Activated">{formatDate(current.activated_at)}</Fact>
              <Fact label="Expiration date">{formatDate(current.expires_at)}</Fact>
            </dl>

            <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <ButtonLink href="/dashboard/my-plan" className="w-full">
                View Plan
                <ArrowRightIcon className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/dashboard/purchases" variant="secondary" className="w-full">
                All purchases
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<ShieldIcon />}
          title="You do not have a protection plan yet"
          description="Browse the plans available in your region and enroll in the coverage that fits your home."
          action={<ButtonLink href="/plans">Browse plans</ButtonLink>}
        />
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Recent purchases"
          action={
            <Link
              href="/dashboard/purchases"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              View all ({data.total_purchases})
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />

        {data.recent_purchases.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">No purchases yet.</p>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-100">
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
                    <tr key={purchase.id} className="transition-colors hover:bg-slate-50/80">
                      <Td>
                        <Link
                          href={`/dashboard/purchases#purchase-${purchase.id}`}
                          className="font-semibold text-brand-600 hover:text-brand-700"
                        >
                          #{purchase.id}
                        </Link>
                      </Td>
                      <Td className="font-medium text-slate-900">{purchase.plan.name}</Td>
                      <Td className="tabular-nums">
                        {formatMoney(purchase.price)}
                        <span className="text-slate-500">
                          {cycleSuffix(purchase.billing_cycle)}
                        </span>
                      </Td>
                      <Td>{purchase.state_code}</Td>
                      <Td>{formatDate(purchase.created_at)}</Td>
                      <Td>
                        <StatusBadge status={purchase.status} size="sm" />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.recent_purchases.map((purchase) => (
                <li key={purchase.id}>
                  <Link
                    href={`/dashboard/purchases#purchase-${purchase.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {purchase.plan.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        #{purchase.id} &middot; {formatDate(purchase.created_at)} &middot;{" "}
                        {formatMoney(purchase.price)}
                        {cycleSuffix(purchase.billing_cycle)}
                      </p>
                    </div>
                    <StatusBadge status={purchase.status} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{children}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-6">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cx("whitespace-nowrap px-5 py-3.5 text-slate-700 sm:px-6", className)}>
      {children}
    </td>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your dashboard" className="space-y-8">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => (
          <Skeleton key={slot} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
