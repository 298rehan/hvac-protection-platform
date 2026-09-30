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
import { ChevronRightIcon, UsersIcon } from "@/components/icons";
import { Alert, Avatar, PageHeader, RegionTag } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { fetchCustomers } from "@/services/adminService";
import type { CustomerSummary } from "@/types";

export default function CustomersPage() {
  return (
    <AdminShell>
      <CustomerList />
    </AdminShell>
  );
}

function CustomerList() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchCustomers({ search: search.trim() || undefined })
        .then(setCustomers)
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has registered on the customer site. Passwords are stored only as hashes and are never returned by the API."
      />

      <SearchInput
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search name, email or city"
        aria-label="Search customers"
        className="w-full sm:max-w-sm"
      />

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <TableCard
          footer={
            customers.length > 0
              ? `${customers.length} customer${customers.length === 1 ? "" : "s"}${search.trim() ? ` matching "${search.trim()}"` : ""}`
              : undefined
          }
        >
          <THead>
            <Th>Customer</Th>
            <Th>Phone</Th>
            <Th>City</Th>
            <Th>Region</Th>
            <Th>Registered</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            {customers.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<UsersIcon className="h-5 w-5" />}
                message={
                  search
                    ? `No customers match "${search}".`
                    : "No customers have registered yet."
                }
              />
            ) : (
              customers.map((customer) => (
                <Tr key={customer.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar firstName={customer.first_name} lastName={customer.last_name} />
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700"
                        >
                          {customer.first_name} {customer.last_name}
                        </Link>
                        <p className="text-xs text-slate-500">{customer.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular-nums">{customer.phone ?? "—"}</Td>
                  <Td>{customer.city ?? "—"}</Td>
                  <Td>{customer.state ? <RegionTag code={customer.state} /> : "—"}</Td>
                  <Td className="text-slate-500">{formatDate(customer.created_at)}</Td>
                  <Td className="text-right">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      View
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
