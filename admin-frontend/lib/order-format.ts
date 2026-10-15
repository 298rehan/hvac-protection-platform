import { formatMoney } from "@/lib/format";
import type {
  CatalogService,
  DiscountType,
  OrderStatus,
  PaymentStatus,
  PricingType,
  ServiceFrequency,
} from "@/types";

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "Pending confirmation",
  CONFIRMED: "Confirmed",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-sky-50 text-sky-800 ring-sky-200",
  SCHEDULED: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  IN_PROGRESS: "bg-violet-50 text-violet-800 ring-violet-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const ORDER_STATUS_DOTS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "bg-amber-500",
  CONFIRMED: "bg-sky-500",
  SCHEDULED: "bg-indigo-500",
  IN_PROGRESS: "bg-violet-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

export const PAYMENT_STATUSES: PaymentStatus[] = ["PENDING", "PAID", "VOID"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Payment pending",
  PAID: "Paid",
  VOID: "Void",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  VOID: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const PAYMENT_METHOD_LABEL = "Pay on service";
export const PAYMENT_METHOD_NOTE =
  "Collected by the technician at the visit. Nothing is charged online.";

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  FIXED: "Fixed price",
  STARTING_AT: "Starting price (confirmed after inspection)",
  PER_UNIT: "Price per unit",
};

export const FREQUENCIES: ServiceFrequency[] = ["ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY"];

export const FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENT: "Percentage",
  AMOUNT: "Fixed amount",
};

/** Icon names the customer site knows how to draw. */
export const SERVICE_ICONS = ["wrench", "snowflake", "sparkles", "bolt", "layers", "home", "alert"];

/** "$40.00", "From $95.00" or "$25.00 / filter". */
export function formatServicePrice(service: Pick<CatalogService, "pricing_type" | "price" | "unit_label">): string {
  const amount = formatMoney(service.price);
  if (service.pricing_type === "STARTING_AT") return `From ${amount}`;
  if (service.pricing_type === "PER_UNIT") return `${amount} / ${service.unit_label || "unit"}`;
  return amount;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Money in the order's own currency (the API sends one per order). */
export function formatAmount(value: string | number | null | undefined, currency = "USD"): string {
  if (currency === "USD") return formatMoney(value);
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

/** Accept "12", "12.5" or "12.50" and return a 2-decimal string, or null if invalid. */
export function normaliseMoney(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Number.parseFloat(trimmed).toFixed(2);
}
