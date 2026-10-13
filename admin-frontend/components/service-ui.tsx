"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { CloseIcon, ImageIcon } from "@/components/icons";
import { Card, CardHeader, DetailRow } from "@/components/ui";
import { cx, formatDate, formatDateTime } from "@/lib/format";
import {
  AC_TYPE_LABELS,
  CONDITION_LABELS,
  PHOTO_CATEGORY_LABELS,
  SR_STATUS_DOTS,
  SR_STATUS_LABELS,
  SR_STATUS_STYLES,
  SERVICE_TYPE_LABELS,
} from "@/lib/service-format";
import type {
  AcUnitBrief,
  ActivityEvent,
  Photo,
  PhotoCategory,
  ServiceRequestDetail,
  ServiceRequestStatus,
} from "@/types";

/* ------------------------------------------------------------------ *
 * Presentational pieces shared by the admin and technician request views.
 * ------------------------------------------------------------------ */

export function ServiceStatusBadge({
  status,
  size = "md",
}: {
  status: ServiceRequestStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        SR_STATUS_STYLES[status],
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", SR_STATUS_DOTS[status])} />
      {SR_STATUS_LABELS[status]}
    </span>
  );
}

/** Thumbnails open the short-lived presigned URL the API returned. */
export function PhotoGallery({ photos, empty }: { photos: Photo[]; empty?: string }) {
  const visible = photos.filter((p) => p.url);
  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        <ImageIcon className="h-4.5 w-4.5 text-slate-400" />
        {empty ?? "No photos."}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {visible.map((photo) => (
        <li key={photo.id}>
          <a
            href={photo.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:ring-4 focus-visible:ring-brand-500/25"
          >
            {/* Presigned S3 URLs expire, so next/image optimisation is not used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url ?? undefined}
              alt={photo.original_filename}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </a>
          <p className="mt-1 truncate text-xs text-slate-500" title={photo.original_filename}>
            {formatDateTime(photo.confirmed_at ?? photo.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Photos grouped by category, in a fixed order. */
export function PhotoGroups({
  photos,
  categories,
}: {
  photos: Photo[];
  categories: PhotoCategory[];
}) {
  return (
    <div className="space-y-5">
      {categories.map((category) => (
        <div key={category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {PHOTO_CATEGORY_LABELS[category]}
          </h3>
          <PhotoGallery
            photos={photos.filter((p) => p.category === category)}
            empty={`No ${PHOTO_CATEGORY_LABELS[category].toLowerCase()} photos.`}
          />
        </div>
      ))}
    </div>
  );
}

export function AcUnitDetails({ unit }: { unit: AcUnitBrief }) {
  return (
    <dl>
      <DetailRow label="Unit">
        {unit.brand} {unit.model_number}
      </DetailRow>
      <DetailRow label="Type">{AC_TYPE_LABELS[unit.ac_type]}</DetailRow>
      <DetailRow label="Serial number">{unit.serial_number ?? "—"}</DetailRow>
      <DetailRow label="Installed">{formatDate(unit.installation_date)}</DetailRow>
      <DetailRow label="Reported condition">{CONDITION_LABELS[unit.reported_condition]}</DetailRow>
      <DetailRow label="Location">
        {unit.address}, {unit.city}, {unit.state} {unit.zip_code}
      </DetailRow>
    </dl>
  );
}

export function TextBlock({ label, value, staffOnly }: { label: string; value: string | null; staffOnly?: boolean }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {staffOnly ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 ring-1 ring-slate-200">
            Staff only
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
        {value || <span className="text-slate-400">Not recorded yet.</span>}
      </p>
    </div>
  );
}

const EVENT_DOTS: Record<string, string> = {
  REQUEST_REJECTED: "bg-rose-500",
  REQUEST_CANCELLED: "bg-slate-400",
  CUSTOMER_DECLINED_WORK: "bg-slate-400",
  REQUEST_COMPLETED: "bg-emerald-500",
  PHOTOS_UPLOADED: "bg-sky-400",
};

export function ActivityTimeline({
  events,
  loading,
  error,
}: {
  events: ActivityEvent[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Card>
      <CardHeader title="Activity history" description="Every change to this request, oldest first." />
      <div className="px-5 py-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading history…</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <ol>
            {events.map((event, index) => {
              const last = index === events.length - 1;
              const dot =
                EVENT_DOTS[event.event_type] ??
                (event.new_status && event.new_status in SR_STATUS_DOTS
                  ? SR_STATUS_DOTS[event.new_status as ServiceRequestStatus]
                  : "bg-brand-500");
              return (
                <li key={event.event_id} className="relative flex gap-4 pb-5 last:pb-0">
                  {!last ? (
                    <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-slate-200" />
                  ) : null}
                  <span
                    aria-hidden
                    className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200"
                  >
                    <span className={cx("h-2 w-2 rounded-full", dot)} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-medium text-slate-900">{event.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(event.event_timestamp)} &middot;{" "}
                      {event.actor_role.charAt(0) + event.actor_role.slice(1).toLowerCase()}
                      {event.actor_id && event.actor_id !== "system" ? ` #${event.actor_id}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}

/** Customer-facing parts of a request: the issue and the customer's photos. */
export function RequestIssue({ request }: { request: ServiceRequestDetail }) {
  return (
    <Card>
      <CardHeader
        title="Reported issue"
        description={`${SERVICE_TYPE_LABELS[request.service_type]} · submitted ${formatDateTime(request.created_at)}`}
      />
      <div className="space-y-5 px-5 py-5">
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {request.description}
        </p>
        {request.photo_recommended ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-100">
            Photos help with leaks and visible damage, but they cannot show internal faults. A
            technician inspection is still needed to assess the unit.
          </p>
        ) : null}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Customer photos
          </h3>
          <PhotoGallery
            photos={request.photos.filter((p) => p.category === "CUSTOMER")}
            empty="The customer did not attach photos."
          />
        </div>
      </div>
    </Card>
  );
}

/** Technician report fields, read-only. */
export function ReportView({ request }: { request: ServiceRequestDetail }) {
  return (
    <Card>
      <CardHeader title="Technician report" />
      <div className="space-y-5 px-5 py-5">
        <TextBlock label="Inspection findings" value={request.inspection_findings} />
        <TextBlock label="Proposed work" value={request.proposed_work} />
        <TextBlock label="Work performed" value={request.work_performed} />
        <TextBlock label="Parts used" value={request.parts_used} />
        <TextBlock label="Technician notes" value={request.technician_notes} staffOnly />
        {request.customer_decision_note ? (
          <TextBlock label="Customer's note on proposed work" value={request.customer_decision_note} />
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Minimal accessible modal: focus moves inside, Escape and the backdrop close
 * it, and the page behind does not scroll.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("textarea, input, select, button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-lg animate-fade-in rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-slate-600">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
