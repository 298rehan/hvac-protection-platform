"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Field, Select, Textarea } from "@/components/form";
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
  CheckIcon,
  DetailRow,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isTerminal, SERVICE_TYPE_LABELS } from "@/lib/service-format";
import {
  approveRequest,
  assignTechnician,
  cancelRequest,
  fetchHistory,
  fetchServiceRequest,
  fetchTechnicians,
  rejectRequest,
  startReview,
} from "@/services/serviceRequestService";
import type { ActivityEvent, ServiceRequestDetail, Technician } from "@/types";

type Dialog = "approve" | "reject" | "assign" | "cancel" | null;

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
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<string | null>(validId ? null : "Invalid request id.");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [technicianId, setTechnicianId] = useState("");

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

  const needsTechnicians = request?.status === "APPROVED" || request?.status === "ASSIGNED";
  useEffect(() => {
    if (!needsTechnicians) return;
    fetchTechnicians(true)
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, [needsTechnicians]);

  const closeDialog = useCallback(() => setDialog(null), []);

  function open(next: Dialog) {
    setNote("");
    setReason("");
    setTechnicianId("");
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

  if (loading) return <PageLoader label="Loading service request" />;
  if (!request) return <Alert>{error ?? "Service request not found."}</Alert>;

  const status = request.status;
  const terminal = isTerminal(status);
  const technicianPhotos = request.photos.filter((p) =>
    ["INSPECTION", "BEFORE", "AFTER"].includes(p.category),
  );
  const workStarted = Boolean(request.inspection_started_at) || technicianPhotos.length > 0;

  return (
    <div className="space-y-6">
      <BackLink href="/service-requests">Back to service requests</BackLink>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Service request #{request.id}
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
          <RequestIssue request={request} />

          <Card>
            <CardHeader title="AC unit" description="As registered by the customer." />
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
          <Card className={!terminal && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(status) ? "ring-1 ring-amber-200" : undefined}>
            <CardHeader title="Actions" description={actionHint(request)} />
            <div className="flex flex-col gap-2 px-5 py-5">
              {status === "SUBMITTED" ? (
                <Button
                  disabled={busy}
                  onClick={() => run(() => startReview(request.id), "Review started.")}
                >
                  Start review
                </Button>
              ) : null}
              {status === "UNDER_REVIEW" ? (
                <>
                  <Button disabled={busy} onClick={() => open("approve")}>
                    <CheckIcon className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button variant="danger-outline" disabled={busy} onClick={() => open("reject")}>
                    Reject
                  </Button>
                </>
              ) : null}
              {status === "APPROVED" || status === "ASSIGNED" ? (
                <Button disabled={busy} onClick={() => open("assign")}>
                  {status === "ASSIGNED" ? "Reassign technician" : "Assign technician"}
                </Button>
              ) : null}
              {!terminal ? (
                <Button variant="subtle" disabled={busy} onClick={() => open("cancel")}>
                  Cancel request
                </Button>
              ) : (
                <p className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                  This request is closed and cannot be changed further.
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
                  <dl className="mt-4 border-t border-slate-100 pt-2">
                    <DetailRow label="Plan">
                      <Link href={`/purchases/${request.plan.purchase_id}`} className="text-brand-600 hover:text-brand-700">
                        {request.plan.plan_name}
                      </Link>
                    </DetailRow>
                  </dl>
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
            </div>
          </Card>
        </div>
      </div>

      {dialog === "approve" ? (
        <Modal
          title={`Approve request #${request.id}?`}
          description="The request moves to Approved. Assign a technician next."
          onClose={closeDialog}
        >
          <Field label="Note (optional)" htmlFor="approve-note" hint="Visible to the customer.">
            <Textarea id="approve-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogButtons
            busy={busy}
            onCancel={closeDialog}
            confirmLabel="Approve request"
            onConfirm={() => run(() => approveRequest(request.id, note.trim()), "Request approved.")}
          />
        </Modal>
      ) : null}

      {dialog === "reject" ? (
        <Modal
          title={`Reject request #${request.id}?`}
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
            confirmLabel="Reject request"
            onConfirm={() => run(() => rejectRequest(request.id, reason.trim()), "Request rejected.")}
          />
        </Modal>
      ) : null}

      {dialog === "assign" ? (
        <Modal
          title={status === "ASSIGNED" ? "Reassign technician" : "Assign technician"}
          description={
            status === "ASSIGNED"
              ? "The current technician loses access to this job. Reassignment is only possible before the inspection starts."
              : "Only active technicians are listed. Open-job counts help balance the workload."
          }
          onClose={closeDialog}
        >
          {technicians.length === 0 ? (
            <Alert tone="info">
              No active technicians. <Link href="/technicians" className="font-semibold underline">Add one</Link> first.
            </Alert>
          ) : (
            <Field label="Technician" htmlFor="technician">
              <Select id="technician" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                <option value="">Choose a technician…</option>
                {technicians
                  .filter((t) => t.id !== request.technician?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} — {t.open_jobs} open job{t.open_jobs === 1 ? "" : "s"}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <DialogButtons
            busy={busy}
            disabled={!technicianId}
            onCancel={closeDialog}
            confirmLabel={status === "ASSIGNED" ? "Reassign" : "Assign"}
            onConfirm={() =>
              run(() => assignTechnician(request.id, Number(technicianId)), "Technician assigned.")
            }
          />
        </Modal>
      ) : null}

      {dialog === "cancel" ? (
        <Modal
          title={`Cancel request #${request.id}?`}
          description="Cancellation is final. The customer will see your note."
          onClose={closeDialog}
        >
          <Field label="Note (optional)" htmlFor="cancel-note">
            <Textarea id="cancel-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogButtons
            busy={busy}
            danger
            onCancel={closeDialog}
            confirmLabel="Cancel request"
            onConfirm={() => run(() => cancelRequest(request.id, note.trim()), "Request cancelled.")}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function actionHint(request: ServiceRequestDetail): string {
  switch (request.status) {
    case "SUBMITTED":
      return "Start the review to claim this request.";
    case "UNDER_REVIEW":
      return "Approve to schedule a technician, or reject with a reason.";
    case "APPROVED":
      return "Assign an active technician to this job.";
    case "ASSIGNED":
      return "Waiting for the technician to start the inspection.";
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
