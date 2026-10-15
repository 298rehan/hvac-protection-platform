/** Service marketplace types - mirror backend/app/schemas/catalog.py and order.py. */

import type { Appointment, TechnicianBrief } from "@/types";

export type PricingType = "FIXED" | "STARTING_AT" | "PER_UNIT";
export type Frequency = "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type VisitWindow = "MORNING" | "AFTERNOON" | "EVENING";
export type OrderStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "VOID";
export type PaymentMethod = "PAY_ON_SERVICE";

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  display_order: number;
  is_active: boolean;
}

export interface ServiceAddon {
  id: number;
  name: string;
  price: string;
  is_active: boolean;
}

export interface CatalogService {
  id: number;
  category: { id: number; name: string; slug: string };
  name: string;
  slug: string;
  description: string;
  icon: string;
  image_url: string | null;
  pricing_type: PricingType;
  price: string;
  unit_label: string | null;
  max_quantity: number;
  duration_minutes: number;
  allowed_frequencies: Frequency[];
  available_states: string[] | null;
  is_active: boolean;
  display_order: number;
  requires_inspection: boolean;
  addons: ServiceAddon[];
}

/** One selected service, as sent to the API. Never carries a price. */
export interface SelectionItem {
  service_id: number;
  quantity: number;
  frequency: Frequency;
  addon_ids: number[];
}

export interface QuoteLine {
  service_id: number;
  service_name: string;
  pricing_type: PricingType;
  unit_price: string;
  unit_label: string | null;
  addons: { id: number; name: string; price: string }[];
  quantity: number;
  frequency: Frequency;
  line_total: string;
  duration_minutes: number;
  is_estimate: boolean;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotal: string;
  discount_code: string | null;
  discount_amount: string;
  tax_amount: string;
  fee_amount: string;
  total: string;
  total_is_estimate: boolean;
  total_duration_minutes: number;
  problems: { service_id: number | null; message: string }[];
}

export interface CustomPlan {
  id: number;
  kind: "PLAN" | "CART";
  name: string;
  ac_unit_id: number | null;
  created_at: string;
  updated_at: string;
  items: SelectionItem[];
  quote: Quote | null;
}

export interface AvailabilitySlot {
  date: string;
  window: VisitWindow;
  available: boolean;
}

export interface CheckoutPayload {
  idempotency_key: string;
  items: SelectionItem[];
  custom_plan_id?: number | null;
  from_cart?: boolean;
  ac_unit_id?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  requested_date: string;
  requested_window: VisitWindow;
  discount_code?: string | null;
  payment_method: PaymentMethod;
  notes?: string | null;
}

export interface OrderItem {
  id: number;
  service_id: number | null;
  service_name: string;
  pricing_type: PricingType;
  unit_price: string;
  quantity: number;
  frequency: Frequency;
  addons: { name: string; price: string }[];
  line_total: string;
  duration_minutes: number;
  is_estimate: boolean;
}

export interface Order {
  id: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  currency: string;
  total: string;
  total_is_estimate: boolean;
  requested_date: string;
  requested_window: VisitWindow;
  city: string;
  state: string;
  created_at: string;
  item_count: number;
  service_names: string[];
  timezone: string;
  appointment: Appointment | null;
  technician: TechnicianBrief | null;
}

export interface OrderDetail extends Order {
  address: string;
  zip_code: string;
  ac_unit_id: number | null;
  custom_plan_id: number | null;
  customer_notes: string | null;
  subtotal: string;
  discount_code: string | null;
  discount_amount: string;
  tax_amount: string;
  fee_amount: string;
  status_reason: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  paid_at: string | null;
  total_duration_minutes: number;
  items: OrderItem[];
}
