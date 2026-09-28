"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { TableCard, TableEmpty, Td, Th } from "@/components/data-table";
import { Input } from "@/components/form";
import { Alert, Spinner } from "@/components/ui";
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Everyone who has registered on the customer site. Passwords are stored only as
            hashes and are never returned by the API.
          </p>
        </div>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email or city"
          aria-label="Search customers"
          className="w-full sm:w-80"
        />
      </header>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading customers" />
        </div>
      ) : (
        <TableCard>
          <thead className="bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>City</Th>
              <Th>Region</Th>
              <Th>Registered</Th>
              <Th>{""}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message={
                  search
                    ? `No customers match "${search}".`
                    : "No customers have registered yet."
                }
              />
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">
                    {customer.first_name} {customer.last_name}
                  </Td>
                  <Td className="text-slate-500">{customer.email}</Td>
                  <Td>{customer.phone ?? "-"}</Td>
                  <Td>{customer.city ?? "-"}</Td>
                  <Td>{customer.state ?? "-"}</Td>
                  <Td>{formatDate(customer.created_at)}</Td>
                  <Td>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-700"
                    >
                      View
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
