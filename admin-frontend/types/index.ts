/**
 * Types mirroring the FastAPI response schemas used by the admin panel.
 * Keep in sync with backend/app/schemas/*.py.
 */

export type UserRole = "CUSTOMER" | "ADMIN";

export type PurchaseStatus = "PENDING" | "ACTIVE" | "CANCELLED" | "EXPIRED";

export type BillingCycle = "MONTHLY" | "ANNUAL";

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface CustomerSummary {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Region {
  code: string;
  name: string;
}

/** One state a plan is sold in, with the price charged there. */
export interface PlanRegion {
  id: number;
  state_code: string;
  state_name: string;
  monthly_price: string;
  annual_price: string | null;
  is_available: boolean;
}

/** Full plan record as returned to admins. */
export interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  features: string[];
  base_monthly_price: string;
  base_annual_price: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  regions: PlanRegion[];
}

export interface PlanRegionInput {
  state_code: string;
  monthly_price: string;
  annual_price?: string | null;
  is_available: boolean;
}

export interface PlanPayload {
  name: string;
  description: string;
  features: string[];
  base_monthly_price: string;
  base_annual_price?: string | null;
  is_active: boolean;
  display_order: number;
  regions: PlanRegionInput[];
}

export interface PurchasePlanRef {
  id: number;
  name: string;
  slug: string;
  description: string;
  features: string[];
}

export interface Purchase {
  id: number;
  user_id: number;
  plan_id: number;
  status: PurchaseStatus;
  billing_cycle: BillingCycle;
  state_code: string;
  price: string;
  created_at: string;
  activated_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  plan: PurchasePlanRef;
}

export interface AdminPurchase extends Purchase {
  customer: CustomerSummary;
}

export interface PurchaseStatusHistoryEntry {
  id: number;
  from_status: PurchaseStatus | null;
  to_status: PurchaseStatus;
  note: string | null;
  created_at: string;
}

export interface PurchaseDetail extends Purchase {
  status_history: PurchaseStatusHistoryEntry[];
  customer: CustomerSummary | null;
}

export interface AdminStats {
  total_customers: number;
  total_plans: number;
  active_plans_sold: number;
  pending_purchases: number;
  cancelled_purchases: number;
  total_revenue: string;
}

export interface PlanSalesRow {
  plan_id: number;
  plan_name: string;
  total_purchases: number;
  active_purchases: number;
  pending_purchases: number;
  revenue: string;
}

export interface AdminDashboard {
  stats: AdminStats;
  recent_purchases: AdminPurchase[];
  recent_customers: CustomerSummary[];
  plan_sales: PlanSalesRow[];
}
