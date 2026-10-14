"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ArrowRightIcon, ClipboardIcon } from "@/components/icons";
import { RequestStatusBadge } from "@/components/service-status";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { SERVICE_TYPE_LABELS, formatVisit } from "@/lib/service-labels";
import { fetchMyServiceRequests } from "@/services/serviceRequestService";
import type { ServiceRequestListItem } from "@/types";

export default function ServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyServiceRequests()
      .then(setRequests)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!requests) return <PageLoader label="Loading your claims" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Claims"
        description="Repair and maintenance claims for the HVAC equipment covered by your plan."
        actions={<ButtonLink href="/dashboard/service-requests/new">File a claim</ButtonLink>}
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title="No claims yet"
          description="If something is wrong with covered equipment, file a claim and our team will review it."
          action={<ButtonLink href="/dashboard/service-requests/new">File a claim</ButtonLink>}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/dashboard/service-requests/${request.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Claim #{request.id} &middot; {formatDate(request.created_at)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {SERVICE_TYPE_LABELS[request.service_type]}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {request.ac_unit.brand} {request.ac_unit.model_number}
                      {request.technician
                        ? ` · Technician: ${request.technician.first_name} ${request.technician.last_name}`
                        : ""}
                    </p>
                    {request.appointment ? (
                      <p className="mt-1 text-sm font-medium text-sky-700">
                        Visit:{" "}
                        {formatVisit(request.appointment.start_at, request.appointment.end_at, request.appointment.timezone)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <RequestStatusBadge status={request.status} />
                    <ArrowRightIcon className="h-4.5 w-4.5 text-slate-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
