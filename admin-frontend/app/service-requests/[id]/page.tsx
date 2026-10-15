"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { CONFIRMABLE_STATUSES, ConfirmClaimPanel } from "@/components/appointment-panel";
import { Field, Textarea } from "@/components/form";
import { ArrowRightIcon, MailIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import {
  AcUnitDetails,
  ActivityTimeline,
  Modal,
  PhotoGallery,
  PhotoGroups,
  ReportView,
  RequestIssue,
  ServiceStatusBadge,
} from "@/components/service-ui";
import {
  Alert,
  Avatar,
  BackLink,
  Button,
  Card,
  CardHeader,
  DetailRow,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  AC_TYPE_LABELS,
  formatPreferredWindow,
  formatVisit,
  isTerminal,
  SERVICE_TYPE_LABELS,
} from "@/lib/service-format";
import { fetchPurchase } from "@/services/adminService";
import {
  cancelRequest,
  fetchHistory,
  fetchServiceRequest,
  rejectRequest,
  requestMoreInfo,
  startReview,
} from "@/services/serviceRequestService";
import type { ActivityEvent, PurchaseDetail, ServiceRequestDetail } from "@/types";

type Dialog = "reject" | "info" | "cancel" | null;

/** Reject and "request more information" are allowed from these statuses. */
const REVIEWABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];

export default function ServiceRequestDetailPage() {
  return (
    <AdminShell>
      <ServiceRequestDetailView />
    </AdminShell>
  );
}

function ServiceRequestDetailView() {
  const params = useParams<{ id: string }>();
  const requestId = Number(params.id);
  const validId = Number.isInteger(requestId) && requestId > 0;

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid request id.");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const loadHistory = useCallback(
    () =>
      fetchHistory(requestId)
        .then((history) => {
          setEvents(history);
          setHistoryError(null);
        })
        .catch((err) => setHistoryError(errorMessage(err))),
    [requestId],
  );

  const load = useCallback(
    () =>
      fetchServiceRequest(requestId).then((detail) => {
        setRequest(detail);
        void loadHistory();
      }),
    [requestId, loadHistory],
  );

  useEffect(() => {
    if (!validId) return;
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [validId, load]);

  const purchaseId = request?.plan.purchase_id;
  useEffect(() => {
    if (!purchaseId) return;
    fetchPurchase(purchaseId)
      .then(setPurchase)
      .catch(() => setPurchase(null));
  }, [purchaseId]);

  const closeDialog = useCallback(() => setDialog(null), []);

  function open(next: Dialog) {
    setNote("");
    setReason("");
    setDialog(next);
  }

  async function run(action: () => Promise<ServiceRequestDetail>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await action();
      setRequest(updated);
      setDialog(null);
      setNotice(success);
      void loadHistory();
    } catch (err) {
      setError(errorMessage(err));
      // Someone else changed the request first: show the current state.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setDialog(null);
        void load().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  /** Reject / request-info need UNDER_REVIEW; start the review first if needed. */
  async function reviewed(id: number, action: () => Promise<ServiceRequestDetail>) {
    if (request?.status === "SUBMITTED") await startReview(id);
    return action();
  }

  if (loading) return <PageLoader label="Loading claim" />;
  if (!request) return <Alert>{error ?? "Claim not found."}</Alert>;

  const status = request.status;
  const terminal = isTerminal(status);
  const technicianPhotos = request.photos.filter((p) =>
    ["INSPECTION", "BEFORE", "AFTER"].includes(p.category),
  );
  const workStarted = Boolean(request.inspection_started_at) || technicianPhotos.length > 0;

  return (
    <div className="space-y-6">
      <BackLink href="/service-requests">Back to claims</BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Claim #{request.id}
            <ServiceStatusBadge status={status} />
          </span>
        }
        description={
          <>
            <span className="font-medium text-slate-800">
              {SERVICE_TYPE_LABELS[request.service_type]}
            </span>{" "}
            &middot; {request.ac_unit.brand} {request.ac_unit.model_number} &middot;{" "}
            {request.plan.plan_name}
          </>
        }
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {CONFIRMABLE_STATUSES.includes(status) ? (
            <ConfirmClaimPanel
              request={request}
              onConfirmed={(updated, message) => {
                setRequest(updated);
                setError(null);
                setNotice(message);
                void loadHistory();
              }}
              onStale={() => void load().catch(() => undefined)}
            />
          ) : null}

          {request.info_request_note ? (
            <Card className={status === "NEEDS_INFO" ? "ring-1 ring-yellow-200" : undefined}>
              <CardHeader
                title="More information"
                description={
                  status === "NEEDS_INFO"
                    ? "Waiting for the customer to reply."
                    : "Latest request and the customer's answer."
                }
              />
              <div className="space-y-4 px-5 py-5">
                <TextBlockLike label="Requested from the customer" value={request.info_request_note} />
                <TextBlockLike
                  label="Customer's answer"
                  value={request.info_response_note ?? "No answer yet."}
                />
              </div>
            </Card>
          ) : null}

          <RequestIssue request={request} />

          <Card>
            <CardHeader
              title="Preferred visit times"
              description={`Customer preferences in the property's time zone (${request.timezone}). These are not confirmed appointments.`}
            />
            <div className="px-5 py-4 text-sm text-slate-700">
              {request.preferred_windows.length ? (
                <ul className="flex flex-wrap gap-2">
                  {request.preferred_windows.map((w) => (
                    <li
                      key={`${w.date}-${w.window}`}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                    >
                      {formatPreferredWindow(w)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">The customer did not choose preferred times.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Service location & equipment" description={request.customer_address ?? undefined} />
            <div className="space-y-5 px-5 py-4">
              <AcUnitDetails unit={request.ac_unit} />
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Initial condition photos
                </h3>
                <PhotoGallery photos={request.ac_unit_photos} empty="No photos taken at registration." />
              </div>
            </div>
          </Card>

          {workStarted || request.inspection_findings || request.work_performed ? (
            <>
              <ReportView request={request} />
              <Card>
                <CardHeader title="Inspection and repair evidence" />
                <div className="px-5 py-5">
                  <PhotoGroups photos={request.photos} categories={["INSPECTION", "BEFORE", "AFTER"]} />
                </div>
              </Card>
            </>
          ) : null}

          <ActivityTimeline events={events} error={historyError} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Actions" description={actionHint(request)} />
            <div className="flex flex-col gap-2 px-5 py-5">
              {REVIEWABLE_STATUSES.includes(status) ? (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => open("info")}>
                    Request more information
                  </Button>
                  <Button variant="danger-outline" disabled={busy} onClick={() => open("reject")}>
                    Reject
                  </Button>
                </>
              ) : null}
              {!terminal ? (
                <Button variant="subtle" disabled={busy} onClick={() => open("cancel")}>
                  Cancel claim
                </Button>
              ) : (
                <p className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                  This claim is closed and cannot be changed further.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Status" />
            <dl className="px-5 py-2">
              <DetailRow label="Submitted">{formatDateTime(request.created_at)}</DetailRow>
              <DetailRow label="Review started">{formatDateTime(request.reviewed_at)}</DetailRow>
              <DetailRow label="Decided">{formatDateTime(request.decided_at)}</DetailRow>
              <DetailRow label="Assigned">{formatDateTime(request.assigned_at)}</DetailRow>
              <DetailRow label="Inspection started">
                {formatDateTime(request.inspection_started_at)}
              </DetailRow>
              <DetailRow label="Repair started">{formatDateTime(request.work_started_at)}</DetailRow>
              <DetailRow label="Completed">{formatDateTime(request.completed_at)}</DetailRow>
              <DetailRow label="Cancelled">{formatDateTime(request.cancelled_at)}</DetailRow>
            </dl>
            {request.status_reason ? (
              <div className="border-t border-slate-100 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {status === "REJECTED" ? "Rejection reason" : status === "CANCELLED" ? "Cancellation note" : "Note"}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{request.status_reason}</p>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="px-5 py-5">
              {request.customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avatar firstName={request.customer.first_name} lastName={request.customer.last_name} />
                    <p className="font-semibold text-slate-900">
                      {request.customer.first_name} {request.customer.last_name}
                    </p>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2.5 break-all">
                      <MailIcon className="h-4 w-4 text-slate-400" />
                      {request.customer.email}
                    </li>
                    <li className="flex items-center gap-2.5">
                      <PhoneIcon className="h-4 w-4 text-slate-400" />
                      {request.customer.phone ?? "—"}
                    </li>
                    <li className="flex items-start gap-2.5">
                      <MapPinIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                      {request.customer_address ?? "—"}
                    </li>
                  </ul>
                  <Link
                    href={`/customers/${request.customer.id}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open customer record
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <p className="text-sm text-slate-500">Customer record unavailable.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Plan & eligibility" description="Checked by the backend when the claim was submitted." />
            <dl className="px-5 py-2">
              <DetailRow label="Plan">
                <Link href={`/purchases/${request.plan.purchase_id}`} className="text-brand-600 hover:text-brand-700">
                  {request.plan.plan_name}
                </Link>
              </DetailRow>
              <DetailRow label="Plan status">{purchase ? purchase.status : "—"}</DetailRow>
              <DetailRow label="Coverage ends">{purchase ? formatDate(purchase.expires_at) : "—"}</DetailRow>
              <DetailRow label="Covered equipment">
                {coverageText(purchase?.plan.covered_ac_types, (v) => AC_TYPE_LABELS[v])}
              </DetailRow>
              <DetailRow label="Covered issues">
                {coverageText(purchase?.plan.covered_service_types, (v) => SERVICE_TYPE_LABELS[v])}
              </DetailRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Technician" />
            <div className="px-5 py-5 text-sm">
              {request.technician ? (
                <div className="flex items-center gap-3">
                  <Avatar firstName={request.technician.first_name} lastName={request.technician.last_name} />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {request.technician.first_name} {request.technician.last_name}
                    </p>
                    <p className="text-slate-500">{request.technician.phone ?? "No phone on file"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Not assigned yet.</p>
              )}
              {request.appointment ? (
                <p className="mt-4 rounded-lg bg-teal-50 px-3 py-2.5 text-teal-900 ring-1 ring-teal-200">
                  Visit:{" "}
                  <span className="font-semibold">
                    {formatVisit(request.appointment.start_at, request.appointment.end_at, request.timezone)}
                  </span>
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {dialog === "reject" ? (
        <Modal
          title={`Reject claim #${request.id}?`}
          description="Rejection is final. The customer will see your reason."
          onClose={closeDialog}
        >
          <Field
            label="Reason"
            htmlFor="reject-reason"
            error={reason.length > 0 && reason.trim().length < 3 ? "Please give a reason (at least 3 characters)." : undefined}
          >
            <Textarea
              id="reject-reason"
              required
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: this issue is not covered by the customer's plan."
            />
          </Field>
          <DialogButtons
            busy={busy}
            danger
            disabled={reason.trim().length < 3}
            onCancel={closeDialog}
            confirmLabel="Reject claim"
            onConfirm={() => run(() => reviewed(request.id, () => rejectRequest(request.id, reason.trim())), "Claim rejected.")}
          />
        </Modal>
      ) : null}

      {dialog === "info" ? (
        <Modal
          title={`Request more information for claim #${request.id}?`}
          description="The claim moves to More info required until the customer replies. They will see your message."
          onClose={closeDialog}
        >
          <Field
            label="What do you need from the customer?"
            htmlFor="info-reason"
            error={reason.length > 0 && reason.trim().length < 3 ? "Please write a message (at least 3 characters)." : undefined}
          >
            <Textarea
              id="info-reason"
              required
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: please upload a photo of the outdoor unit's label."
            />
          </Field>
          <DialogButtons
            busy={busy}
            disabled={reason.trim().length < 3}
            onCancel={closeDialog}
            confirmLabel="Send request"
            onConfirm={() =>
              run(() => reviewed(request.id, () => requestMoreInfo(request.id, reason.trim())), "More information requested from the customer.")
            }
          />
        </Modal>
      ) : null}

      {dialog === "cancel" ? (
        <Modal
          title={`Cancel claim #${request.id}?`}
          description="Cancellation is final and cancels any confirmed visit. The customer will see your note."
          onClose={closeDialog}
        >
          <Field label="Note (optional)" htmlFor="cancel-note">
            <Textarea id="cancel-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogButtons
            busy={busy}
            danger
            onCancel={closeDialog}
            confirmLabel="Cancel claim"
            onConfirm={() => run(() => cancelRequest(request.id, note.trim()), "Claim cancelled.")}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function actionHint(request: ServiceRequestDetail): string {
  switch (request.status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "Assign a technician and confirm on the left, ask the customer for more information, or reject with a reason.";
    case "NEEDS_INFO":
      return "Waiting for the customer to provide more information.";
    case "APPROVED":
    case "ASSIGNED":
      return "Pick a technician and time on the left, then confirm the claim.";
    case "SCHEDULED":
      return "Confirmed. Waiting for the technician's visit. You can update the appointment on the left.";
    case "INSPECTION_IN_PROGRESS":
      return "The technician is inspecting the unit.";
    case "AWAITING_CUSTOMER_APPROVAL":
      return "Waiting for the customer to approve the proposed work.";
    case "IN_PROGRESS":
      return "The repair is under way.";
    default:
      return "No further actions.";
  }
}

function DialogButtons({
  busy,
  disabled,
  danger,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Back
      </Button>
      <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy || disabled}>
        {busy ? "Saving…" : confirmLabel}
      </Button>
    </div>
  );
}

function coverageText<T extends string>(values: T[] | null | undefined, label: (v: T) => string): string {
  if (values === undefined) return "—";
  if (values === null) return "Not restricted (no coverage rule defined)";
  if (values.length === 0) return "None";
  return values.map(label).join(", ");
}

function TextBlockLike({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{value}</p>
    </div>
  );
}
