import type {
  AcType,
  PhotoCategory,
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
};

export const SR_STATUSES = Object.keys(SR_STATUS_LABELS) as ServiceRequestStatus[];

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
};

export const AC_TYPE_LABELS: Record<AcType, string> = {
  CENTRAL_SPLIT: "Central split system",
  DUCTLESS_MINI_SPLIT: "Ductless mini-split",
  HEAT_PUMP: "Heat pump",
  PACKAGED: "Packaged unit",
  WINDOW: "Window unit",
  PORTABLE: "Portable unit",
  OTHER: "Other",
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
