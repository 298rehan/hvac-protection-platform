import type {
  CatalogService,
  Frequency,
  OrderStatus,
  PaymentStatus,
  PricingType,
  VisitWindow,
} from "@/types/marketplace";

/** Format money in the currency the API reports (USD by default). */
export function formatPrice(value: string | number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function isPositive(value: string | null | undefined): boolean {
  return Number.parseFloat(value ?? "0") > 0;
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export const WINDOW_LABELS: Record<VisitWindow, string> = {
  MORNING: "Morning (8am – 12pm)",
  AFTERNOON: "Afternoon (12pm – 4pm)",
  EVENING: "Evening (4pm – 7pm)",
};

export const WINDOW_SHORT: Record<VisitWindow, string> = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
};

export const PRICING_LABELS: Record<PricingType, string> = {
  FIXED: "Fixed price",
  STARTING_AT: "Starting price",
  PER_UNIT: "Price per unit",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  SCHEDULED: "Technician scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-brand-50 text-brand-800 ring-brand-200",
  SCHEDULED: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  IN_PROGRESS: "bg-sky-50 text-sky-800 ring-sky-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pay on service",
  PAID: "Paid",
  VOID: "Not charged",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  PENDING: "bg-slate-50 text-slate-700 ring-slate-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  VOID: "bg-slate-100 text-slate-500 ring-slate-200",
};

/** Customers may cancel or change the requested time only before a technician is booked. */
export const CUSTOMER_EDITABLE: OrderStatus[] = ["PENDING_CONFIRMATION", "CONFIRMED"];

/** "$40.00", "From $95.00" or "$25.00 per filter" - from the catalog price. */
export function servicePriceLabel(service: Pick<CatalogService, "pricing_type" | "price" | "unit_label">): string {
  const price = formatPrice(service.price);
  if (service.pricing_type === "STARTING_AT") return `From ${price}`;
  if (service.pricing_type === "PER_UNIT") return `${price} per ${service.unit_label ?? "unit"}`;
  return Number.parseFloat(service.price) === 0 ? "Free" : price;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr${hours > 1 ? "s" : ""}`;
}

/** A plain YYYY-MM-DD date shown without time-zone shifting. */
export function formatPlainDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A UTC timestamp shown in the property's time zone. */
export function formatInZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString("en-US");
  }
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
