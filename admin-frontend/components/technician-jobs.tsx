"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChevronRightIcon, MapPinIcon, PhoneIcon, WrenchIcon } from "@/components/icons";
import { ServiceStatusBadge } from "@/components/service-ui";
import { Alert, Card, PageHeader, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatVisit, isTerminal, SERVICE_TYPE_LABELS } from "@/lib/service-format";
import { fetchAssignedJobs } from "@/services/serviceRequestService";
import type { ServiceRequestListItem } from "@/types";

/** The signed-in technician's jobs. The API only ever returns their own. */
export function TechnicianJobs({ closed }: { closed: boolean }) {
  const [jobs, setJobs] = useState<ServiceRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssignedJobs(closed)
      .then((list) => setJobs(closed ? list.filter((job) => isTerminal(job.status)) : list))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [closed]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={closed ? "Job history" : "My jobs"}
        description={
          closed
            ? "Jobs you worked on that are now completed or cancelled."
            : "Jobs assigned to you that are still open. Open a job to record the inspection and repair."
        }
      />

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((key) => (
            <Card key={key} className="space-y-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <WrenchIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-500">
            {closed ? "No closed jobs yet." : "No open jobs are assigned to you right now."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/technician/jobs/${job.id}`}
                className="hover-lift spotlight block rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Job #{job.id} &middot; {SERVICE_TYPE_LABELS[job.service_type]}
                    </p>
                    <p className="mt-1 truncate text-base font-semibold text-slate-900">
                      {job.ac_unit.brand} {job.ac_unit.model_number}
                    </p>
                  </div>
                  <ServiceStatusBadge status={job.status} size="sm" />
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {job.customer ? (
                    <li className="flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4 text-slate-400" />
                      {job.customer.first_name} {job.customer.last_name}
                      {job.customer.phone ? ` · ${job.customer.phone}` : ""}
                    </li>
                  ) : null}
                  <li className="flex items-start gap-2">
                    <MapPinIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                    {job.ac_unit.address}, {job.ac_unit.city}, {job.ac_unit.state} {job.ac_unit.zip_code}
                  </li>
                </ul>
                {job.appointment ? (
                  <p className="mt-3 rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-900 ring-1 ring-teal-200">
                    Visit: {formatVisit(job.appointment.start_at, job.appointment.end_at, job.timezone)}
                  </p>
                ) : null}
                <p className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  Updated {formatDate(job.updated_at)}
                  <span className="inline-flex items-center gap-0.5 font-semibold text-brand-600">
                    Open job
                    <ChevronRightIcon className="h-4 w-4" />
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
