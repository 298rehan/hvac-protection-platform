"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import { Input, Select } from "@/components/form";
import { Alert, Spinner, StatusBadge } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cycleSuffix, formatDate, formatMoney } from "@/lib/format";
import { fetchPurchases } from "@/services/adminService";
import type { AdminPurchase, PurchaseStatus } from "@/types";

const STATUSES: (PurchaseStatus | "")[] = [
  "",
  "PENDING",
  "ACTIVE",
  "CANCELLED",
  "EXPIRED",
];

export default function PurchasesPage() {
  return (
    <AdminShell>
      <PurchaseList />
    </AdminShell>
  );
}

function PurchaseList() {
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [status, setStatus] = useState<PurchaseStatus | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchPurchases({ status, search: search.trim() || undefined })
        .then(setPurchases)
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [status, search]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchases</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Approve pending enrollments to activate coverage, or cancel them. Open a
          purchase to see its full status history.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as PurchaseStatus | "")}
          aria-label="Filter by status"
          className="w-full sm:w-48"
        >
          {STATUSES.map((option) => (
            <option key={option || "ALL"} value={option}>
              {option || "All statuses"}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer name, email or plan"
          aria-label="Search purchases"
          className="w-full sm:w-80"
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading purchases" />
        </div>
      ) : (
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
              <Th>{""}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {purchases.length === 0 ? (
              <TableEmpty colSpan={8} message="No purchases match these filters." />
            ) : (
              purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-slate-50">
                  <Td className="font-semibold text-slate-900">#{purchase.id}</Td>
                  <Td>
                    <Link
                      href={`/customers/${purchase.customer.id}`}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      {purchase.customer.first_name} {purchase.customer.last_name}
                    </Link>
                    <p className="text-xs font-normal text-slate-500">
                      {purchase.customer.email}
                    </p>
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
                  <Td>
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {purchase.status === "PENDING" ? "Review" : "View"}
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
