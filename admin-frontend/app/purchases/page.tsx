"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import {
  TableCard,
  TableEmpty,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/data-table";
import { SearchInput } from "@/components/form";
import { ChevronRightIcon, ReceiptIcon } from "@/components/icons";
import { Alert, Avatar, PageHeader, RegionTag, StatusBadge } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx, cycleSuffix, formatDate, formatMoney, STATUS_LABELS } from "@/lib/format";
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
      <PageHeader
        title="Purchases"
        description="Approve pending enrollments to activate coverage, or cancel them. Open a purchase to see its full status history."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="radiogroup"
          aria-label="Filter by status"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <div className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
            {STATUSES.map((option) => {
              const selected = status === option;
              return (
                <button
                  key={option || "ALL"}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatus(option)}
                  className={cx(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    selected
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {option ? STATUS_LABELS[option] : "All statuses"}
                </button>
              );
            })}
          </div>
        </div>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer name, email or plan"
          aria-label="Search purchases"
          className="w-full lg:w-80"
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={7} />
      ) : (
        <TableCard
          footer={
            purchases.length > 0
              ? `${purchases.length} purchase${purchases.length === 1 ? "" : "s"}`
              : undefined
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
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            {purchases.length === 0 ? (
              <TableEmpty
                colSpan={8}
                message="No purchases match these filters."
                icon={<ReceiptIcon className="h-5 w-5" />}
              />
            ) : (
              purchases.map((purchase) => (
                <Tr
                  key={purchase.id}
                  className={purchase.status === "PENDING" ? "bg-amber-50/30" : undefined}
                >
                  <Td className="font-semibold text-slate-900">#{purchase.id}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar
                        firstName={purchase.customer.first_name}
                        lastName={purchase.customer.last_name}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${purchase.customer.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700"
                        >
                          {purchase.customer.first_name} {purchase.customer.last_name}
                        </Link>
                        <p className="text-xs font-normal text-slate-500">
                          {purchase.customer.email}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>{purchase.plan.name}</Td>
                  <Td>
                    <RegionTag code={purchase.state_code} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(purchase.price)}
                    <span className="text-slate-500">
                      {cycleSuffix(purchase.billing_cycle)}
                    </span>
                  </Td>
                  <Td className="text-slate-500">{formatDate(purchase.created_at)}</Td>
                  <Td>
                    <StatusBadge status={purchase.status} size="sm" />
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className={cx(
                        "inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors",
                        purchase.status === "PENDING"
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "text-brand-600 hover:bg-brand-50 hover:text-brand-700",
                      )}
                    >
                      {purchase.status === "PENDING" ? "Review" : "View"}
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
