import { CheckIcon } from "@/components/ui";
import { cx, formatDateTime } from "@/lib/format";
import {
  REQUEST_STATUS_DOTS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_STYLES,
} from "@/lib/service-labels";
import type { ActivityEvent, ServiceRequestStatus } from "@/types";

export function RequestStatusBadge({
  status,
  size = "md",
}: {
  status: ServiceRequestStatus;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        REQUEST_STATUS_STYLES[status],
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", REQUEST_STATUS_DOTS[status])} />
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

/* The normal path through the lifecycle, used for the progress stepper. */
const STEPS: { label: string; statuses: ServiceRequestStatus[] }[] = [
  { label: "Submitted", statuses: ["SUBMITTED"] },
  { label: "Review", statuses: ["UNDER_REVIEW", "NEEDS_INFO"] },
  { label: "Approved", statuses: ["APPROVED"] },
  { label: "Technician assigned", statuses: ["ASSIGNED"] },
  { label: "Visit scheduled", statuses: ["SCHEDULED"] },
  { label: "Inspection", statuses: ["INSPECTION_IN_PROGRESS", "AWAITING_CUSTOMER_APPROVAL"] },
  { label: "Repair", statuses: ["IN_PROGRESS"] },
  { label: "Completed", statuses: ["COMPLETED"] },
];

/** Horizontal (desktop) / vertical (mobile) progress through the lifecycle. */
export function RequestProgress({ status }: { status: ServiceRequestStatus }) {
  const current = STEPS.findIndex((step) => step.statuses.includes(status));
  // Rejected / cancelled requests have no position on the happy path.
  if (current === -1) return null;
  const done = status === "COMPLETED";

  return (
    <ol className="grid gap-3 sm:grid-cols-8 sm:gap-2" aria-label="Claim progress">
      {STEPS.map((step, index) => {
        const complete = index < current || done;
        const active = index === current && !done;
        return (
          <li key={step.label} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
            <div className="flex w-full items-center gap-2">
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1",
                  complete && "bg-brand-600 text-white ring-brand-600",
                  active && "bg-white text-brand-700 ring-2 ring-brand-500",
                  !complete && !active && "bg-white text-slate-400 ring-slate-200",
                )}
                aria-current={active ? "step" : undefined}
              >
                {complete ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cx(
                    "hidden h-0.5 flex-1 rounded-full sm:block",
                    complete ? "bg-brand-500" : "bg-slate-200",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cx(
                "text-xs font-medium",
                active ? "text-brand-700" : complete ? "text-slate-700" : "text-slate-400",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "You",
  ADMIN: "Service team",
  TECHNICIAN: "Technician",
  SYSTEM: "System",
};

/** Customer-safe activity history, oldest first. */
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  }
  return (
    <ol>
      {events.map((event, index) => {
        const last = index === events.length - 1;
        return (
          <li key={event.event_id} className="relative flex gap-4 pb-6 last:pb-0">
            {!last ? (
              <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-slate-200" />
            ) : null}
            <span
              aria-hidden
              className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-200"
            >
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium text-slate-900">{event.description}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(event.event_timestamp)} &middot;{" "}
                {ROLE_LABELS[event.actor_role] ?? event.actor_role}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
