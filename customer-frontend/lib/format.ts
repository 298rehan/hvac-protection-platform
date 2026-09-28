import type { BillingCycle, PurchaseStatus } from "@/types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Prices arrive as decimal strings so no precision is lost in transit. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(amount)) return "—";
  return currency.format(amount);
}

export function cycleSuffix(cycle: BillingCycle): string {
  return cycle === "ANNUAL" ? "/year" : "/month";
}

export function cycleLabel(cycle: BillingCycle): string {
  return cycle === "ANNUAL" ? "Billed annually" : "Billed monthly";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Tailwind classes for each purchase status badge. */
export const STATUS_STYLES: Record<PurchaseStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-amber-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-rose-100 text-rose-800 ring-rose-200",
  EXPIRED: "bg-slate-200 text-slate-700 ring-slate-300",
};

export const STATUS_DESCRIPTIONS: Record<PurchaseStatus, string> = {
  PENDING: "Waiting for approval by our service team.",
  ACTIVE: "Your coverage is live.",
  CANCELLED: "This enrollment was cancelled.",
  EXPIRED: "This coverage term has ended.",
};

/** Joins class names, dropping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
