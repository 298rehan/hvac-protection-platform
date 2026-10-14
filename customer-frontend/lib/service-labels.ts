import type {
  AcType,
  PhotoCategory,
  PreferredWindowName,
  ReportedCondition,
  ServiceRequestStatus,
  ServiceType,
} from "@/types";

/* Human-readable labels for the maintenance-workflow enums. API values stay upper-case. */

export const AC_TYPE_LABELS: Record<AcType, string> = {
  CENTRAL_SPLIT: "Central split system",
  DUCTLESS_MINI_SPLIT: "Ductless mini-split",
  HEAT_PUMP: "Heat pump",
  PACKAGED: "Packaged unit",
  WINDOW: "Window unit",
  PORTABLE: "Portable unit",
  OTHER: "Other HVAC equipment",
  FURNACE: "Furnace / heating system",
};

export const CONDITION_LABELS: Record<ReportedCondition, string> = {
  GOOD: "Good - working normally",
  FAIR: "Fair - minor issues",
  POOR: "Poor - noticeable problems",
  NOT_WORKING: "Not working",
  UNKNOWN: "Not sure",
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  ROUTINE_MAINTENANCE: "Routine maintenance",
  NOT_COOLING: "Not cooling",
  NOT_HEATING: "Not heating",
  WATER_LEAK: "Water leak",
  STRANGE_NOISE: "Strange noise",
  VISIBLE_DAMAGE: "Visible damage",
  OTHER: "Something else",
  SYSTEM_NOT_STARTING: "System not starting",
  THERMOSTAT_ISSUE: "Thermostat / control issue",
};

/** Service types where photos help the review (mirrors the backend list). */
export const PHOTO_RECOMMENDED: ServiceType[] = ["WATER_LEAK", "VISIBLE_DAMAGE"];

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  INITIAL: "Condition at registration",
  CUSTOMER: "Your photos",
  INSPECTION: "Technician inspection",
  BEFORE: "Before repair",
  AFTER: "After repair",
};

export const REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ASSIGNED: "Technician assigned",
  INSPECTION_IN_PROGRESS: "Inspection in progress",
  AWAITING_CUSTOMER_APPROVAL: "Awaiting your approval",
  IN_PROGRESS: "Repair in progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NEEDS_INFO: "More information required",
  SCHEDULED: "Scheduled",
};

export const REQUEST_STATUS_DESCRIPTIONS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "We have your claim and will review it shortly.",
  UNDER_REVIEW: "Our service team is reviewing your claim.",
  APPROVED: "Approved. A technician visit will be scheduled next.",
  REJECTED: "This claim was not approved.",
  ASSIGNED: "A technician has been assigned. We will confirm a visit time with you.",
  INSPECTION_IN_PROGRESS: "Your technician is inspecting the unit.",
  AWAITING_CUSTOMER_APPROVAL: "The technician has proposed work that needs your go-ahead.",
  IN_PROGRESS: "Repair work is under way.",
  COMPLETED: "The job is complete.",
  CANCELLED: "This claim was cancelled.",
  NEEDS_INFO: "Our team needs a little more information from you before continuing.",
  SCHEDULED: "A technician visit is confirmed.",
};

export const REQUEST_STATUS_STYLES: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "bg-slate-100 text-slate-700 ring-slate-200",
  UNDER_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  APPROVED: "bg-brand-50 text-brand-800 ring-brand-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  ASSIGNED: "bg-brand-50 text-brand-800 ring-brand-200",
  INSPECTION_IN_PROGRESS: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  AWAITING_CUSTOMER_APPROVAL: "bg-amber-50 text-amber-800 ring-amber-200",
  IN_PROGRESS: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  NEEDS_INFO: "bg-orange-50 text-orange-800 ring-orange-200",
  SCHEDULED: "bg-sky-50 text-sky-800 ring-sky-200",
};

export const REQUEST_STATUS_DOTS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "bg-slate-400",
  UNDER_REVIEW: "bg-amber-500",
  APPROVED: "bg-brand-500",
  REJECTED: "bg-rose-500",
  ASSIGNED: "bg-brand-500",
  INSPECTION_IN_PROGRESS: "bg-indigo-500",
  AWAITING_CUSTOMER_APPROVAL: "bg-amber-500",
  IN_PROGRESS: "bg-indigo-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
  NEEDS_INFO: "bg-orange-500",
  SCHEDULED: "bg-sky-500",
};

/** Statuses from which the customer may cancel (mirrors the backend transition table). */
export const CUSTOMER_CANCELLABLE: ServiceRequestStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "AWAITING_CUSTOMER_APPROVAL",
  "NEEDS_INFO",
];

export const TERMINAL_STATUSES: ServiceRequestStatus[] = ["REJECTED", "COMPLETED", "CANCELLED"];

/** Upload limits shown in the UI. The backend re-checks everything. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/** Preferred visit windows, in the property's local time (mirrors the backend). */
export const PREFERRED_WINDOW_LABELS: Record<PreferredWindowName, string> = {
  MORNING: "Morning (8am - 12pm)",
  AFTERNOON: "Afternoon (12pm - 4pm)",
  EVENING: "Evening (4pm - 7pm)",
};

export const MAX_PREFERRED_WINDOWS = 5;
export const MAX_PREFERRED_DAYS_AHEAD = 60;
export const MAX_CLAIM_PHOTOS = 10;

/** "Tue 21 Oct, 10:00 AM CDT" in the property's time zone. */
export function formatInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** Visit range, e.g. "Tue, Oct 21, 2026, 10:00 AM CDT - 12:00 PM". */
export function formatVisit(startIso: string, endIso: string, timeZone: string): string {
  const end = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(endIso),
  );
  return `${formatInZone(startIso, timeZone)} - ${end}`;
}

/** "Tue, Oct 21" for a YYYY-MM-DD date string (no time-zone shift). */
export function formatWindowDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Today's date (YYYY-MM-DD) in a given IANA time zone. */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
