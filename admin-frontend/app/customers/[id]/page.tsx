"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import { Alert, Card, DetailRow, Spinner, StatusBadge } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cycleLabel, cycleSuffix, formatDate, formatMoney } from "@/lib/format";
import {
  fetchCustomer,
  fetchCustomerCurrentPlan,
  fetchCustomerPurchases,
} from "@/services/adminService";
import type { Purchase, User } from "@/types";

export default function CustomerDetailPage() {
  return (
    <AdminShell>
      <CustomerDetail />
    </AdminShell>
  );
}

function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);

  const [customer, setCustomer] = useState<User | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [currentPlan, setCurrentPlan] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(customerId)) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      fetchCustomer(customerId),
      fetchCustomerPurchases(customerId),
      fetchCustomerCurrentPlan(customerId),
    ])
      .then(([customerResult, purchaseResult, planResult]) => {
        if (cancelled) return;
        setCustomer(customerResult);
        setPurchases(purchaseResult);
        setCurrentPlan(planResult);
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
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading customer" />
      </div>
    );
  }

  if (error) return <Alert>{error}</Alert>;
  if (!customer) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/customers"
        className="text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        &larr; Back to customers
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {customer.first_name} {customer.last_name}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Customer #{customer.id} &middot; registered {formatDate(customer.created_at)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h2 className="text-base font-semibold text-slate-900">Account details</h2>
          <dl className="mt-4">
            <DetailRow label="Email">{customer.email}</DetailRow>
            <DetailRow label="Phone">{customer.phone ?? "-"}</DetailRow>
            <DetailRow label="Address">{customer.address ?? "-"}</DetailRow>
            <DetailRow label="City">{customer.city ?? "-"}</DetailRow>
            <DetailRow label="Service region">{customer.state ?? "-"}</DetailRow>
            <DetailRow label="ZIP code">{customer.zip_code ?? "-"}</DetailRow>
            <DetailRow label="Role">{customer.role}</DetailRow>
            <DetailRow label="Account status">
              {customer.is_active ? "Active" : "Deactivated"}
            </DetailRow>
          </dl>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Current plan</h2>
          {currentPlan ? (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-bold text-slate-900">
                  {currentPlan.plan.name}
                </p>
                <StatusBadge status={currentPlan.status} />
              </div>
              <dl className="mt-3">
                <DetailRow label="Price">
                  {formatMoney(currentPlan.price)}
                  <span className="ml-1 font-normal text-slate-500">
                    {cycleSuffix(currentPlan.billing_cycle)}
                  </span>
                </DetailRow>
                <DetailRow label="Billing">
                  {cycleLabel(currentPlan.billing_cycle)}
                </DetailRow>
                <DetailRow label="Region">{currentPlan.state_code}</DetailRow>
                <DetailRow label="Activated">
                  {formatDate(currentPlan.activated_at)}
                </DetailRow>
                <DetailRow label="Expires">
                  {formatDate(currentPlan.expires_at)}
                </DetailRow>
              </dl>
              <Link
                href={`/purchases/${currentPlan.id}`}
                className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Open enrollment #{currentPlan.id}
              </Link>
            </>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              This customer does not have an active plan.
            </p>
          )}
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Purchase history</h2>
        <div className="mt-4">
          <TableCard>
            <thead className="bg-slate-50">
              <tr>
                <Th>Ref</Th>
                <Th>Plan</Th>
                <Th>Price</Th>
                <Th>Region</Th>
                <Th>Submitted</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.length === 0 ? (
                <TableEmpty colSpan={7} message="This customer has no purchases." />
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/purchases/${purchase.id}`}
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
                    <Td>{formatDate(purchase.expires_at)}</Td>
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
    </div>
  );
}
