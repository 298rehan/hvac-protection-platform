import type {
  AcType,
  PhotoCategory,
  PreferredWindow,
  PreferredWindowName,
  ReportedCondition,
  ServiceRequestStatus,
  ServiceType,
} from "@/types";

/** Display helpers for the maintenance workflow; API values stay upper-case. */

export const SR_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ASSIGNED: "Assigned",
  INSPECTION_IN_PROGRESS: "Inspecting",
  AWAITING_CUSTOMER_APPROVAL: "Awaiting customer",
  IN_PROGRESS: "Repair in progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NEEDS_INFO: "More info required",
  SCHEDULED: "Scheduled",
};

export const SR_STATUS_STYLES: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "bg-amber-50 text-amber-800 ring-amber-200",
  UNDER_REVIEW: "bg-sky-50 text-sky-800 ring-sky-200",
  APPROVED: "bg-brand-50 text-brand-800 ring-brand-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  ASSIGNED: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  INSPECTION_IN_PROGRESS: "bg-violet-50 text-violet-800 ring-violet-200",
  AWAITING_CUSTOMER_APPROVAL: "bg-orange-50 text-orange-800 ring-orange-200",
  IN_PROGRESS: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  NEEDS_INFO: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  SCHEDULED: "bg-teal-50 text-teal-800 ring-teal-200",
};

export const SR_STATUS_DOTS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "bg-amber-500",
  UNDER_REVIEW: "bg-sky-500",
  APPROVED: "bg-brand-500",
  REJECTED: "bg-rose-500",
  ASSIGNED: "bg-indigo-500",
  INSPECTION_IN_PROGRESS: "bg-violet-500",
  AWAITING_CUSTOMER_APPROVAL: "bg-orange-500",
  IN_PROGRESS: "bg-cyan-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
  NEEDS_INFO: "bg-yellow-500",
  SCHEDULED: "bg-teal-500",
};

/** Lifecycle order, used for filters. */
export const SR_STATUSES: ServiceRequestStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "APPROVED",
  "ASSIGNED",
  "SCHEDULED",
  "INSPECTION_IN_PROGRESS",
  "AWAITING_CUSTOMER_APPROVAL",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

export const TERMINAL_STATUSES: ServiceRequestStatus[] = ["REJECTED", "COMPLETED", "CANCELLED"];

export function isTerminal(status: ServiceRequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses in which the technician report can be edited (mirrors the backend). */
export const REPORT_EDITABLE: ServiceRequestStatus[] = [
  "INSPECTION_IN_PROGRESS",
  "AWAITING_CUSTOMER_APPROVAL",
  "IN_PROGRESS",
];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  ROUTINE_MAINTENANCE: "Routine maintenance",
  NOT_COOLING: "Not cooling",
  NOT_HEATING: "Not heating",
  WATER_LEAK: "Water leak",
  STRANGE_NOISE: "Strange noise",
  VISIBLE_DAMAGE: "Visible damage",
  OTHER: "Other",
  SYSTEM_NOT_STARTING: "System not starting",
  THERMOSTAT_ISSUE: "Thermostat / controls",
};

export const AC_TYPE_LABELS: Record<AcType, string> = {
  CENTRAL_SPLIT: "Central split system",
  DUCTLESS_MINI_SPLIT: "Ductless mini-split",
  HEAT_PUMP: "Heat pump",
  PACKAGED: "Packaged unit",
  WINDOW: "Window unit",
  PORTABLE: "Portable unit",
  OTHER: "Other",
  FURNACE: "Furnace / heating system",
};

export const CONDITION_LABELS: Record<ReportedCondition, string> = {
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  NOT_WORKING: "Not working",
  UNKNOWN: "Unknown",
};

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  INITIAL: "Initial condition",
  CUSTOMER: "Customer photos",
  INSPECTION: "Inspection",
  BEFORE: "Before repair",
  AFTER: "After repair",
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PREFERRED_WINDOW_LABELS: Record<PreferredWindowName, string> = {
  MORNING: "Morning (8am–12pm)",
  AFTERNOON: "Afternoon (12–4pm)",
  EVENING: "Evening (4–7pm)",
};

/** Default visit start (local time) when booking from a preferred window. */
export const PREFERRED_WINDOW_START: Record<PreferredWindowName, string> = {
  MORNING: "08:00",
  AFTERNOON: "12:00",
  EVENING: "16:00",
};

/** "Tue 21 Oct" for a YYYY-MM-DD date, without time-zone shifting. */
export function formatWindowDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatPreferredWindow(window: PreferredWindow): string {
  return `${formatWindowDate(window.date)} · ${PREFERRED_WINDOW_LABELS[window.window]}`;
}

/** Format a UTC timestamp in the property's time zone, e.g. "Tue 21 Oct, 10:00 AM CDT". */
export function formatInZone(iso: string, timeZone: string, withDate = true): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** "Tue 21 Oct, 10:00 AM – 12:00 PM CDT" for an appointment. */
export function formatVisit(startIso: string, endIso: string, timeZone: string): string {
  const end = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(endIso));
  const start = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startIso));
  return `${start} – ${end}`;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon–Fri 08:00–17:00" style summary of working hours (days Mon=0..Sun=6). */
export function formatWorkingHours(days: number[], start: string, end: string): string {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.length > 2 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  const dayText =
    sorted.length === 0
      ? "No days"
      : sorted.length === 7
        ? "Every day"
        : contiguous
          ? `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`
          : sorted.map((d) => DAY_SHORT[d]).join(", ");
  return `${dayText} ${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

/** Split a UTC timestamp into local date (YYYY-MM-DD) and time (HH:MM) in a zone. */
export function localDateTimeParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Today's date (YYYY-MM-DD) in a time zone, for date-input minimums. */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
