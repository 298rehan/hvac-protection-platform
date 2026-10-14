"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Field, Textarea } from "@/components/form";
import { PhotoGallery } from "@/components/photo-gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import { ActivityTimeline, RequestProgress, RequestStatusBadge } from "@/components/service-status";
import {
  Alert,
  BackLink,
  Button,
  Card,
  CardHeader,
  DetailRow,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  AC_TYPE_LABELS,
  CUSTOMER_CANCELLABLE,
  PREFERRED_WINDOW_LABELS,
  REQUEST_STATUS_DESCRIPTIONS,
  SERVICE_TYPE_LABELS,
  formatVisit,
  formatWindowDate,
} from "@/lib/service-labels";
import {
  cancelServiceRequest,
  decideProposedWork,
  fetchServiceRequest,
  fetchServiceRequestHistory,
  provideClaimInfo,
  requestServiceRequestPhotoUpload,
} from "@/services/serviceRequestService";
import type { ActivityEvent, ServiceRequestDetail } from "@/types";

export default function ServiceRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = Number(params.id);

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [history, setHistory] = useState<ActivityEvent[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [infoNote, setInfoNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    return Promise.all([fetchServiceRequest(requestId), fetchServiceRequestHistory(requestId)])
      .then(([detail, events]) => {
        setRequest(detail);
        setHistory(events);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(errorMessage(err));
      });
  }, [requestId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") {
      const failed = Number(params.get("photos_failed") ?? 0);
      const message = failed
        ? `Claim submitted, but ${failed} photo(s) could not be uploaded. You can add them again below.`
        : "Claim submitted. Our team will review it shortly.";
      const id = window.setTimeout(() => setNotice(message), 0);
      return () => window.clearTimeout(id);
    }
  }, []);

  if (notFound) {
    return (
      <div className="space-y-6">
        <BackLink href="/dashboard/service-requests">Claims</BackLink>
        <Alert>This claim was not found.</Alert>
      </div>
    );
  }
  if (!request) return error ? <Alert>{error}</Alert> : <PageLoader label="Loading claim" />;

  async function run(action: () => Promise<ServiceRequestDetail>, success: string) {
    setBusy(true);
    setError(null);
    try {
      setRequest(await action());
      setNote("");
      setNotice(success);
      await reload();
    } catch (err) {
      // 409 usually means the status moved on in the meantime - show the latest.
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) await reload();
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (!window.confirm("Cancel this claim?")) return;
    void run(() => cancelServiceRequest(requestId, note.trim() || null), "Claim cancelled.");
  }

  function sendInfo() {
    const text = infoNote.trim();
    if (text.length < 3) {
      setError("Please add the requested information.");
      return;
    }
    void run(async () => {
      const updated = await provideClaimInfo(requestId, text);
      setInfoNote("");
      return updated;
    }, "Thanks - your claim is back with our review team.");
  }

  function decide(approve: boolean) {
    const question = approve
      ? "Approve the proposed work so the technician can start?"
      : "Decline the proposed work? The claim will be closed.";
    if (!window.confirm(question)) return;
    void run(
      () => decideProposedWork(requestId, approve, note.trim() || null),
      approve ? "Thanks - the technician can now start the work." : "You declined the proposed work.",
    );
  }

  const unit = request.ac_unit;
  const awaiting = request.status === "AWAITING_CUSTOMER_APPROVAL";
  const needsInfo = request.status === "NEEDS_INFO";
  const appointment = request.appointment;
  const cancellable = CUSTOMER_CANCELLABLE.includes(request.status);
  const canUpload = request.allowed_upload_categories.includes("CUSTOMER");
  const hasReport =
    request.inspection_findings || request.proposed_work || request.work_performed || request.parts_used;

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard/service-requests">Claims</BackLink>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {SERVICE_TYPE_LABELS[request.service_type]}
            <RequestStatusBadge status={request.status} />
          </span>
        }
        description={`Claim #${request.id} · ${REQUEST_STATUS_DESCRIPTIONS[request.status]}`}
      />

      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {request.status === "REJECTED" || request.status === "CANCELLED" ? (
        <Alert tone={request.status === "REJECTED" ? "error" : "info"}>
          {request.status === "REJECTED" ? "Reason: " : ""}
          {request.status_reason ?? REQUEST_STATUS_DESCRIPTIONS[request.status]}
        </Alert>
      ) : (
        <Card className="px-5 py-5 sm:px-6">
          <RequestProgress status={request.status} />
        </Card>
      )}

      {needsInfo ? (
        <Card className="border-orange-200">
          <CardHeader title="More information required" description="Our review team asked:" />
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <p className="rounded-lg bg-orange-50 px-4 py-3 text-sm whitespace-pre-line text-orange-900 ring-1 ring-orange-100">
              {request.info_request_note}
            </p>
            <Field label="Your answer" htmlFor="info-note" hint={`${infoNote.trim().length} / 2000 - you can also add photos below.`}>
              <Textarea id="info-note" rows={4} maxLength={2000} value={infoNote} onChange={(e) => setInfoNote(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button onClick={sendInfo} disabled={busy}>
                Send information
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {awaiting ? (
        <Card className="border-amber-200">
          <CardHeader title="Your approval is needed" description="The technician proposes the following work." />
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm whitespace-pre-line text-amber-900 ring-1 ring-amber-100">
              {request.proposed_work}
            </p>
            <Field label="Note for the technician" htmlFor="decision-note" hint="Optional">
              <Textarea id="decision-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => decide(false)} disabled={busy}>
                Decline
              </Button>
              <Button onClick={() => decide(true)} disabled={busy}>
                Approve work
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your claim" description={`Submitted ${formatDateTime(request.created_at)}`} />
            <p className="px-5 py-5 text-sm leading-relaxed whitespace-pre-line text-slate-700 sm:px-6">
              {request.description}
            </p>
            {request.info_response_note && !needsInfo ? (
              <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Information you provided</p>
                {request.info_request_note ? (
                  <p className="mt-1 text-xs text-slate-500">Asked: {request.info_request_note}</p>
                ) : null}
                <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{request.info_response_note}</p>
              </div>
            ) : null}
          </Card>

          {hasReport ? (
            <Card>
              <CardHeader title="Technician report" />
              <dl className="space-y-4 px-5 py-5 sm:px-6">
                {(
                  [
                    ["Inspection findings", request.inspection_findings],
                    ["Proposed work", request.proposed_work],
                    ["Work performed", request.work_performed],
                    ["Parts used", request.parts_used],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
                      <dd className="mt-1 text-sm whitespace-pre-line text-slate-700">{value}</dd>
                    </div>
                  ))}
                {request.customer_decision_note ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your note</dt>
                    <dd className="mt-1 text-sm text-slate-700">{request.customer_decision_note}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Photos"
              description={
                request.photo_recommended && canUpload
                  ? "Photos of the problem help us review this claim."
                  : undefined
              }
            />
            <div className="space-y-6 px-5 py-5 sm:px-6">
              <PhotoGallery
                photos={request.photos}
                onRefresh={() => void reload()}
                deletableCategories={canUpload ? ["CUSTOMER"] : []}
              />
              {canUpload ? (
                <div className="border-t border-slate-100 pt-5">
                  <PhotoUploader
                    title="Add photos of the problem"
                    requestUpload={(file) => requestServiceRequestPhotoUpload(requestId, "CUSTOMER", file)}
                    onUploaded={() => void reload()}
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="px-5 py-5 sm:px-6">
              <ActivityTimeline events={history} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Technician visit" />
            <div className="space-y-3 px-5 py-4 text-sm sm:px-6">
              {appointment ? (
                <div className="rounded-lg bg-sky-50 px-3 py-2.5 ring-1 ring-sky-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Confirmed</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {formatVisit(appointment.start_at, appointment.end_at, appointment.timezone)}
                  </p>
                </div>
              ) : null}
              {request.technician ? (
                <p className="font-medium text-slate-900">
                  {request.technician.first_name} {request.technician.last_name}
                </p>
              ) : (
                <p className="text-slate-500">Not assigned yet.</p>
              )}
              {!appointment && request.preferred_windows.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Your preferred times (not yet confirmed)
                  </p>
                  <ul className="mt-1 space-y-0.5 text-slate-600">
                    {request.preferred_windows.map((w) => (
                      <li key={`${w.date}-${w.window}`}>
                        {formatWindowDate(w.date)} &middot; {PREFERRED_WINDOW_LABELS[w.window]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="AC unit" />
            <dl className="px-5 py-2 sm:px-6">
              <DetailRow label="Unit">
                <Link href={`/dashboard/ac-units/${unit.id}`} className="text-brand-700 hover:underline">
                  {unit.brand} {unit.model_number}
                </Link>
              </DetailRow>
              <DetailRow label="Type">{AC_TYPE_LABELS[unit.ac_type]}</DetailRow>
              <DetailRow label="Address">
                {unit.address}, {unit.city}, {unit.state} {unit.zip_code}
              </DetailRow>
              <DetailRow label="Plan">{request.plan.plan_name}</DetailRow>
            </dl>
          </Card>

          {cancellable ? (
            <Card className="p-5 sm:p-6">
              <p className="text-sm font-semibold text-slate-900">Cancel this claim</p>
              <p className="mt-1 text-sm text-slate-500">You can cancel until a technician is assigned.</p>
              {!awaiting ? (
                <div className="mt-3">
                  <Field label="Reason" htmlFor="cancel-note" hint="Optional">
                    <Textarea id="cancel-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </div>
              ) : null}
              <Button variant="danger" size="sm" className="mt-4" onClick={cancel} disabled={busy}>
                Cancel claim
              </Button>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
