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
import { SearchInput, Select } from "@/components/form";
import { ChevronRightIcon, WrenchIcon } from "@/components/icons";
import { ServiceStatusBadge } from "@/components/service-ui";
import { Alert, Avatar, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { SERVICE_TYPE_LABELS, SR_STATUS_LABELS, SR_STATUSES } from "@/lib/service-format";
import { fetchServiceRequests } from "@/services/serviceRequestService";
import type { ServiceRequestListItem, ServiceRequestStatus } from "@/types";

/** Quick filters for the statuses that need an admin's attention. */
const QUICK: { value: ServiceRequestStatus | ""; label: string }[] = [
  { value: "SUBMITTED", label: "New" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Needs technician" },
  { value: "", label: "All" },
];

const NEEDS_ACTION: ServiceRequestStatus[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"];

export default function ServiceRequestsPage() {
  return (
    <AdminShell>
      <ServiceRequestList />
    </AdminShell>
  );
}

function ServiceRequestList() {
  const [requests, setRequests] = useState<ServiceRequestListItem[]>([]);
  const [status, setStatus] = useState<ServiceRequestStatus | "">("SUBMITTED");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchServiceRequests({ status, search: search.trim() || undefined })
        .then(setRequests)
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [status, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service requests"
        description="Review new requests, approve or reject them, and assign a technician. Open a request to see photos, the technician's report and its full history."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="radiogroup"
            aria-label="Quick status filter"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          >
            <div className="inline-flex gap-1 rounded-lg bg-slate-200/60 p-1">
              {QUICK.map((option) => {
                const selected = status === option.value;
                return (
                  <button
                    key={option.value || "ALL"}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setStatus(option.value)}
                    className={cx(
                      "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      selected
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Select
            aria-label="Filter by any status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ServiceRequestStatus | "")}
            className="sm:w-56"
          >
            <option value="">All statuses</option>
            {SR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SR_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer, email or AC brand/model"
          aria-label="Search service requests"
          className="w-full lg:w-80"
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <TableSkeleton columns={7} />
      ) : (
        <TableCard
          footer={
            requests.length > 0
              ? `${requests.length} request${requests.length === 1 ? "" : "s"}`
              : undefined
          }
        >
          <THead>
            <Th>Ref</Th>
            <Th>Customer</Th>
            <Th>AC unit</Th>
            <Th>Issue</Th>
            <Th>Status</Th>
            <Th>Technician</Th>
            <Th>Submitted</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </THead>
          <TBody>
            {requests.length === 0 ? (
              <TableEmpty
                colSpan={8}
                message="No service requests match these filters."
                icon={<WrenchIcon className="h-5 w-5" />}
              />
            ) : (
              requests.map((request) => {
                const needsAction = NEEDS_ACTION.includes(request.status);
                return (
                  <Tr key={request.id} className={needsAction ? "bg-amber-50/30" : undefined}>
                    <Td className="font-semibold text-slate-900">#{request.id}</Td>
                    <Td>
                      {request.customer ? (
                        <div className="flex items-center gap-3">
                          <Avatar
                            firstName={request.customer.first_name}
                            lastName={request.customer.last_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/customers/${request.customer.id}`}
                              className="font-medium text-slate-900 hover:text-brand-700"
                            >
                              {request.customer.first_name} {request.customer.last_name}
                            </Link>
                            <p className="text-xs text-slate-500">{request.customer.email}</p>
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <span className="font-medium text-slate-900">{request.ac_unit.brand}</span>{" "}
                      <span className="text-slate-500">{request.ac_unit.model_number}</span>
                    </Td>
                    <Td>{SERVICE_TYPE_LABELS[request.service_type]}</Td>
                    <Td>
                      <ServiceStatusBadge status={request.status} size="sm" />
                    </Td>
                    <Td className="text-slate-600">
                      {request.technician
                        ? `${request.technician.first_name} ${request.technician.last_name}`
                        : "—"}
                    </Td>
                    <Td className="text-slate-500">{formatDate(request.created_at)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/service-requests/${request.id}`}
                        className={cx(
                          "inline-flex items-center gap-0.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors",
                          needsAction
                            ? "bg-brand-600 text-white hover:bg-brand-700"
                            : "text-brand-600 hover:bg-brand-50 hover:text-brand-700",
                        )}
                      >
                        {needsAction ? "Review" : "View"}
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </Td>
                  </Tr>
                );
              })
            )}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
