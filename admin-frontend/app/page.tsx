"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import { Alert, Card, Spinner, StatusBadge } from "@/components/ui";
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading dashboard" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const { stats } = data;

  const cards = [
    { label: "Total Customers", value: String(stats.total_customers) },
    { label: "Total Plans", value: String(stats.total_plans) },
    { label: "Active Plans Sold", value: String(stats.active_plans_sold) },
    { label: "Pending Purchases", value: String(stats.pending_purchases), tone: "amber" },
    { label: "Cancelled Purchases", value: String(stats.cancelled_purchases), tone: "rose" },
    { label: "Total Revenue", value: formatMoney(stats.total_revenue), tone: "emerald" },
  ] as const;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Live figures calculated from the database. Revenue counts activated and expired
          enrollments at the price each customer agreed to.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent purchases</h2>
          <Link
            href="/purchases"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all
          </Link>
        </div>
        <div className="mt-4">
          <TableCard>
            <thead className="bg-slate-50">
              <tr>
                <Th>Ref</Th>
                <Th>Customer</Th>
                <Th>Plan</Th>
                <Th>Region</Th>
                <Th>Price</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recent_purchases.length === 0 ? (
                <TableEmpty colSpan={7} message="No purchases yet." />
              ) : (
                data.recent_purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50">
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
                        className="hover:text-brand-700"
                      >
                        {purchase.customer.first_name} {purchase.customer.last_name}
                      </Link>
                    </Td>
                    <Td>{purchase.plan.name}</Td>
                    <Td>{purchase.state_code}</Td>
                    <Td>
                      {formatMoney(purchase.price)}
                      <span className="text-slate-500">
                        {cycleSuffix(purchase.billing_cycle)}
                      </span>
                    </Td>
                    <Td>{formatDate(purchase.created_at)}</Td>
                    <Td>
                      <StatusBadge status={purchase.status} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Recent customers</h2>
          <div className="mt-4">
            <TableCard>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Region</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_customers.length === 0 ? (
                  <TableEmpty colSpan={4} message="No customers yet." />
                ) : (
                  data.recent_customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-brand-600 hover:text-brand-700"
                        >
                          {customer.first_name} {customer.last_name}
                        </Link>
                      </Td>
                      <Td className="text-slate-500">{customer.email}</Td>
                      <Td>{customer.state ?? "—"}</Td>
                      <Td>{formatDate(customer.created_at)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableCard>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Plan sales summary</h2>
          <div className="mt-4">
            <TableCard>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Plan</Th>
                  <Th>Total</Th>
                  <Th>Active</Th>
                  <Th>Pending</Th>
                  <Th>Revenue</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.plan_sales.length === 0 ? (
                  <TableEmpty colSpan={5} message="No plans yet." />
                ) : (
                  data.plan_sales.map((row) => (
                    <tr key={row.plan_id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/plans/${row.plan_id}`}
                          className="font-medium text-brand-600 hover:text-brand-700"
                        >
                          {row.plan_name}
                        </Link>
                      </Td>
                      <Td>{row.total_purchases}</Td>
                      <Td>{row.active_purchases}</Td>
                      <Td>{row.pending_purchases}</Td>
                      <Td className="font-semibold text-slate-900">
                        {formatMoney(row.revenue)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableCard>
          </div>
        </section>
      </div>
    </div>
  );
}
