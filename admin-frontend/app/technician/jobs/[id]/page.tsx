"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { TechnicianShell } from "@/components/admin-shell";
import { Field, Textarea } from "@/components/form";
import { MapPinIcon, PhoneIcon } from "@/components/icons";
import { PhotoUploader } from "@/components/photo-uploader";
import {
  AcUnitDetails,
  ActivityTimeline,
  PhotoGallery,
  PhotoGroups,
  RequestIssue,
  ServiceStatusBadge,
  TextBlock,
} from "@/components/service-ui";
import {
  Alert,
  BackLink,
  Button,
  Card,
  CardHeader,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { formatVisit, isTerminal, REPORT_EDITABLE, SERVICE_TYPE_LABELS } from "@/lib/service-format";
import {
  completeJob,
  fetchHistory,
  fetchServiceRequest,
  requestCustomerApproval,
  startInspection,
  startWork,
  updateReport,
} from "@/services/serviceRequestService";
import type { ActivityEvent, ReportPayload, ServiceRequestDetail } from "@/types";

type ReportForm = Required<{ [K in keyof ReportPayload]: string }>;

const REPORT_FIELDS: { key: keyof ReportForm; label: string; hint?: string; rows?: number }[] = [
  { key: "inspection_findings", label: "Inspection findings", hint: "What you found. Visible to the customer.", rows: 4 },
  {
    key: "proposed_work",
    label: "Proposed work",
    hint: "Only needed if the customer must approve extra work before you continue.",
  },
  { key: "work_performed", label: "Work performed", hint: "Required to complete a repair.", rows: 4 },
  { key: "parts_used", label: "Parts used" },
  { key: "technician_notes", label: "Internal notes", hint: "Staff only - never shown to the customer." },
];

function toForm(request: ServiceRequestDetail): ReportForm {
  return {
    inspection_findings: request.inspection_findings ?? "",
    proposed_work: request.proposed_work ?? "",
    work_performed: request.work_performed ?? "",
    parts_used: request.parts_used ?? "",
    technician_notes: request.technician_notes ?? "",
  };
}

export default function TechnicianJobPage() {
  return (
    <TechnicianShell>
      <JobDetail />
    </TechnicianShell>
  );
}

function JobDetail() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const validId = Number.isInteger(jobId) && jobId > 0;

  const [job, setJob] = useState<ServiceRequestDetail | null>(null);
  const [form, setForm] = useState<ReportForm | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid job id.");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(
    () =>
      fetchHistory(jobId)
        .then((history) => {
          setEvents(history);
          setHistoryError(null);
        })
        .catch((err) => setHistoryError(errorMessage(err))),
    [jobId],
  );

  /** Replace the job; the report form follows unless the user has unsaved edits. */
  const apply = useCallback((detail: ServiceRequestDetail, resetForm: boolean) => {
    setJob(detail);
    if (resetForm) setForm(toForm(detail));
  }, []);

  const load = useCallback(
    (resetForm = true) =>
      fetchServiceRequest(jobId).then((detail) => {
        apply(detail, resetForm);
        void loadHistory();
      }),
    [jobId, apply, loadHistory],
  );

  useEffect(() => {
    if (!validId) return;
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [validId, load]);

  async function run(action: () => Promise<ServiceRequestDetail>, success: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await action(), true);
      setNotice(success);
      void loadHistory();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        void load(false).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Loading job" />;
  if (!job || !form) return <Alert>{error ?? "Job not found."}</Alert>;

  const status = job.status;
  const editable = REPORT_EDITABLE.includes(status);
  const saved = toForm(job);
  const dirty = (Object.keys(form) as (keyof ReportForm)[]).some((key) => form[key] !== saved[key]);
  const afterPhotos = job.photos.filter((p) => p.category === "AFTER").length;

  async function saveReport(event: FormEvent) {
    event.preventDefault();
    const payload: ReportPayload = {};
    (Object.keys(form!) as (keyof ReportForm)[]).forEach((key) => {
      if (form![key] !== saved[key]) payload[key] = form![key].trim() || null;
    });
    await run(() => updateReport(job!.id, payload), "Report saved.");
  }

  return (
    <div className="space-y-6">
      <BackLink href={isTerminal(status) ? "/technician/history" : "/technician"}>
        Back to {isTerminal(status) ? "job history" : "my jobs"}
      </BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Job #{job.id}
            <ServiceStatusBadge status={status} />
          </span>
        }
        description={
          <>
            <span className="font-medium text-slate-800">{SERVICE_TYPE_LABELS[job.service_type]}</span>{" "}
            &middot; {job.ac_unit.brand} {job.ac_unit.model_number} &middot; assigned{" "}
            {formatDateTime(job.assigned_at)}
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {job.appointment ? (
        <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">
          Confirmed visit:{" "}
          <span className="font-semibold">
            {formatVisit(job.appointment.start_at, job.appointment.end_at, job.timezone)}
          </span>{" "}
          <span className="text-teal-800">(property local time)</span>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <RequestIssue request={job} />

          {editable ? (
            <Card>
              <CardHeader
                title="Service report"
                description="Save your notes as you go. They are required before you can move the job on."
              />
              <form onSubmit={saveReport} className="space-y-5 px-5 py-5">
                {REPORT_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label} htmlFor={field.key} hint={field.hint}>
                    <Textarea
                      id={field.key}
                      rows={field.rows ?? 3}
                      maxLength={field.key === "parts_used" ? 2000 : 5000}
                      value={form[field.key]}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                  </Field>
                ))}
                <div className="flex items-center justify-end gap-3">
                  {dirty ? <span className="text-xs text-amber-700">Unsaved changes</span> : null}
                  <Button type="submit" disabled={!dirty || busy}>
                    {busy ? "Saving…" : "Save report"}
                  </Button>
                </div>
              </form>
            </Card>
          ) : status !== "ASSIGNED" && status !== "SCHEDULED" ? (
            <Card>
              <CardHeader title="Service report" />
              <div className="space-y-5 px-5 py-5">
                <TextBlock label="Inspection findings" value={job.inspection_findings} />
                <TextBlock label="Proposed work" value={job.proposed_work} />
                <TextBlock label="Work performed" value={job.work_performed} />
                <TextBlock label="Parts used" value={job.parts_used} />
                <TextBlock label="Internal notes" value={job.technician_notes} staffOnly />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Inspection and repair photos" />
            <div className="space-y-6 px-5 py-5">
              {job.allowed_upload_categories.length > 0 ? (
                <PhotoUploader
                  requestId={job.id}
                  categories={job.allowed_upload_categories}
                  onUploaded={() => void load(false).catch(() => undefined)}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  {status === "ASSIGNED" || status === "SCHEDULED"
                    ? "Start the inspection to add photos."
                    : "Photos can no longer be added to this job."}
                </p>
              )}
              <PhotoGroups photos={job.photos} categories={["INSPECTION", "BEFORE", "AFTER"]} />
            </div>
          </Card>

          <ActivityTimeline events={events} error={historyError} />
        </div>

        <div className="space-y-6">
          <Card className={!isTerminal(status) ? "ring-1 ring-brand-200" : undefined}>
            <CardHeader title="Next step" description={nextStepHint(job, afterPhotos)} />
            <div className="flex flex-col gap-2 px-5 py-5">
              {dirty && editable ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  Save the report before moving the job on.
                </p>
              ) : null}
              {status === "ASSIGNED" || status === "SCHEDULED" ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(() => startInspection(job.id), "Inspection started.", "Start the inspection now?")
                  }
                >
                  Start inspection
                </Button>
              ) : null}
              {status === "INSPECTION_IN_PROGRESS" ? (
                <>
                  <Button
                    disabled={busy || dirty || !job.inspection_findings}
                    onClick={() => run(() => startWork(job.id), "Repair started.", "Start the repair now?")}
                  >
                    Start repair
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || dirty || !job.inspection_findings || !job.proposed_work}
                    onClick={() =>
                      run(
                        () => requestCustomerApproval(job.id),
                        "The customer has been asked to approve the proposed work.",
                        "Send the proposed work to the customer for approval?",
                      )
                    }
                  >
                    Request customer approval
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={busy || dirty || !job.inspection_findings}
                    onClick={() =>
                      run(
                        () => completeJob(job.id),
                        "Job completed.",
                        "Complete the job without a repair? Use this when no repair was needed.",
                      )
                    }
                  >
                    Complete (no repair needed)
                  </Button>
                </>
              ) : null}
              {status === "IN_PROGRESS" ? (
                <Button
                  disabled={busy || dirty || !job.work_performed || afterPhotos === 0}
                  onClick={() => run(() => completeJob(job.id), "Job completed.", "Mark this job as completed?")}
                >
                  Complete job
                </Button>
              ) : null}
              {status === "AWAITING_CUSTOMER_APPROVAL" ? (
                <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-800 ring-1 ring-orange-200">
                  Waiting for the customer to approve or decline the proposed work.
                </p>
              ) : null}
              {isTerminal(status) ? (
                <p className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                  This job is closed.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="px-5 py-5">
              {job.customer ? (
                <>
                  <p className="font-semibold text-slate-900">
                    {job.customer.first_name} {job.customer.last_name}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2.5">
                      <PhoneIcon className="h-4 w-4 text-slate-400" />
                      {job.customer.phone ?? "—"}
                    </li>
                    <li className="flex items-start gap-2.5">
                      <MapPinIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                      {job.customer_address ?? "—"}
                    </li>
                  </ul>
                </>
              ) : (
                <p className="text-sm text-slate-500">Customer details unavailable.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="AC unit" description={`Covered by ${job.plan.plan_name}`} />
            <div className="space-y-4 px-5 py-4">
              <AcUnitDetails unit={job.ac_unit} />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Initial condition photos
                </h3>
                <PhotoGallery photos={job.ac_unit_photos} empty="No registration photos." />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function nextStepHint(job: ServiceRequestDetail, afterPhotos: number): string {
  switch (job.status) {
    case "ASSIGNED":
      return "No visit time is booked yet. Start the inspection when you arrive on site.";
    case "SCHEDULED":
      return "Start the inspection when you arrive for the confirmed visit.";
    case "INSPECTION_IN_PROGRESS":
      return job.inspection_findings
        ? "Start the repair, ask the customer to approve extra work, or complete the job if no repair is needed."
        : "Record and save your inspection findings first.";
    case "IN_PROGRESS":
      if (!job.work_performed) return "Record and save the work performed.";
      if (afterPhotos === 0) return "Upload at least one 'after repair' photo.";
      return "Everything is recorded. You can complete the job.";
    case "AWAITING_CUSTOMER_APPROVAL":
      return "The customer is reviewing the proposed work.";
    default:
      return "No further actions.";
  }
}
