import type {
  AcType,
  PhotoCategory,
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
  OTHER: "Other",
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
};

export const REQUEST_STATUS_DESCRIPTIONS: Record<ServiceRequestStatus, string> = {
  SUBMITTED: "We have your request and will review it shortly.",
  UNDER_REVIEW: "Our service team is reviewing your request.",
  APPROVED: "Approved. A technician will be assigned next.",
  REJECTED: "This request was not approved.",
  ASSIGNED: "A technician has been assigned and will inspect your unit.",
  INSPECTION_IN_PROGRESS: "Your technician is inspecting the unit.",
  AWAITING_CUSTOMER_APPROVAL: "The technician has proposed work that needs your go-ahead.",
  IN_PROGRESS: "Repair work is under way.",
  COMPLETED: "The job is complete.",
  CANCELLED: "This request was cancelled.",
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
};

/** Statuses from which the customer may cancel (mirrors the backend transition table). */
export const CUSTOMER_CANCELLABLE: ServiceRequestStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "AWAITING_CUSTOMER_APPROVAL",
];

export const TERMINAL_STATUSES: ServiceRequestStatus[] = ["REJECTED", "COMPLETED", "CANCELLED"];

/** Upload limits shown in the UI. The backend re-checks everything. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
