"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/data-table";
import {
  ArrowRightIcon,
  BanIcon,
  ClockIcon,
  DollarIcon,
  LayersIcon,
  ReceiptIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import {
  Alert,
  Avatar,
  ButtonLink,
  CardHeader,
  PageHeader,
  RegionTag,
  Skeleton,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cycleSuffix, formatDate, formatMoney } from "@/lib/format";
import { fetchDashboard } from "@/services/adminService";
import type { AdminDashboard } from "@/types";

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  );
}

function DashboardContent() {
  const [data, setData] = useState<AdminDashboard | null>(null);
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

  const { stats } = data;
  const maxPlanSales = Math.max(1, ...data.plan_sales.map((row) => row.total_purchases));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Live figures calculated from the database. Revenue counts activated and expired enrollments at the price each customer agreed to."
        actions={
          <ButtonLink href="/plans/new" variant="secondary">
            New plan
          </ButtonLink>
        }
      />

      {stats.pending_purchases > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3 text-sm text-amber-900">
            <ClockIcon className="h-5 w-5 text-amber-500" />
            <span>
              <strong className="font-semibold">
                {stats.pending_purchases} enrollment{stats.pending_purchases === 1 ? "" : "s"}
              </strong>{" "}
              waiting for review.
            </span>
          </p>
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1 pl-8 text-sm font-semibold text-amber-900 hover:text-amber-950 sm:pl-0"
          >
            Review purchases
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Revenue"
          value={formatMoney(stats.total_revenue)}
          icon={<DollarIcon className="h-4.5 w-4.5" />}
          tone="emerald"
        />
        <StatCard
          label="Active Plans Sold"
          value={stats.active_plans_sold}
          icon={<ShieldIcon className="h-4.5 w-4.5" />}
          tone="brand"
        />
        <StatCard
          label="Pending Purchases"
          value={stats.pending_purchases}
          icon={<ClockIcon className="h-4.5 w-4.5" />}
          tone="amber"
          href="/purchases"
          hint="Open the purchases queue"
        />
        <StatCard
          label="Total Customers"
          value={stats.total_customers}
          icon={<UsersIcon className="h-4.5 w-4.5" />}
          tone="slate"
          href="/customers"
        />
        <StatCard
          label="Total Plans"
          value={stats.total_plans}
          icon={<LayersIcon className="h-4.5 w-4.5" />}
          tone="slate"
          href="/plans"
        />
        <StatCard
          label="Cancelled Purchases"
          value={stats.cancelled_purchases}
          icon={<BanIcon className="h-4.5 w-4.5" />}
          tone="rose"
        />
      </div>

      <TableCard
        header={
          <CardHeader
            title="Recent purchases"
            action={<ViewAll href="/purchases" />}
          />
        }
      >
        <THead>
          <Th>Ref</Th>
          <Th>Customer</Th>
          <Th>Plan</Th>
          <Th>Region</Th>
          <Th className="text-right">Price</Th>
          <Th>Submitted</Th>
          <Th>Status</Th>
        </THead>
        <TBody>
          {data.recent_purchases.length === 0 ? (
            <TableEmpty
              colSpan={7}
              message="No purchases yet."
              icon={<ReceiptIcon className="h-5 w-5" />}
            />
          ) : (
            data.recent_purchases.map((purchase) => (
              <Tr key={purchase.id}>
                <Td>
                  <Link
                    href={`/purchases/${purchase.id}`}
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    #{purchase.id}
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/customers/${purchase.customer.id}`}
                    className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-brand-700"
                  >
                    <Avatar
                      firstName={purchase.customer.first_name}
                      lastName={purchase.customer.last_name}
                      size="sm"
                    />
                    {purchase.customer.first_name} {purchase.customer.last_name}
                  </Link>
                </Td>
                <Td>{purchase.plan.name}</Td>
                <Td>
                  <RegionTag code={purchase.state_code} />
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(purchase.price)}
                  <span className="text-slate-500">{cycleSuffix(purchase.billing_cycle)}</span>
                </Td>
                <Td className="text-slate-500">{formatDate(purchase.created_at)}</Td>
                <Td>
                  <StatusBadge status={purchase.status} size="sm" />
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </TableCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <TableCard
          header={
            <CardHeader title="Recent customers" action={<ViewAll href="/customers" />} />
          }
        >
          <THead>
            <Th>Name</Th>
            <Th>Region</Th>
            <Th>Joined</Th>
          </THead>
          <TBody>
            {data.recent_customers.length === 0 ? (
              <TableEmpty
                colSpan={3}
                message="No customers yet."
                icon={<UsersIcon className="h-5 w-5" />}
              />
            ) : (
              data.recent_customers.map((customer) => (
                <Tr key={customer.id}>
                  <Td>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="group flex items-center gap-3"
                    >
                      <Avatar
                        firstName={customer.first_name}
                        lastName={customer.last_name}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900 group-hover:text-brand-700">
                          {customer.first_name} {customer.last_name}
                        </span>
                        <span className="block text-xs text-slate-500">{customer.email}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td>{customer.state ? <RegionTag code={customer.state} /> : "—"}</Td>
                  <Td className="text-slate-500">{formatDate(customer.created_at)}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>

        <TableCard
          header={<CardHeader title="Plan sales summary" action={<ViewAll href="/plans" />} />}
        >
          <THead>
            <Th>Plan</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Active</Th>
            <Th className="text-right">Pending</Th>
            <Th className="text-right">Revenue</Th>
          </THead>
          <TBody>
            {data.plan_sales.length === 0 ? (
              <TableEmpty
                colSpan={5}
                message="No plans yet."
                icon={<LayersIcon className="h-5 w-5" />}
              />
            ) : (
              data.plan_sales.map((row) => (
                <Tr key={row.plan_id}>
                  <Td>
                    <Link
                      href={`/plans/${row.plan_id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {row.plan_name}
                    </Link>
                    <div
                      aria-hidden
                      className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-slate-100"
                    >
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(row.total_purchases / maxPlanSales) * 100}%` }}
                      />
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{row.total_purchases}</Td>
                  <Td className="text-right tabular-nums">{row.active_purchases}</Td>
                  <Td className="text-right tabular-nums">{row.pending_purchases}</Td>
                  <Td className="text-right font-semibold text-slate-900 tabular-nums">
                    {formatMoney(row.revenue)}
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      </div>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
    >
      View all
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-8">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((slot) => (
          <Skeleton key={slot} className="h-[116px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
