/**
 * Types mirroring the FastAPI response schemas.
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

/** A plan already priced for one specific state. */
export interface PublicPlan {
  id: number;
  name: string;
  slug: string;
  description: string;
  features: string[];
  display_order: number;
  state_code: string;
  state_name: string;
  monthly_price: string;
  annual_price: string | null;
  available_in_region: boolean;
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

export interface PurchaseStatusHistoryEntry {
  id: number;
  from_status: PurchaseStatus | null;
  to_status: PurchaseStatus;
  note: string | null;
  created_at: string;
}

export interface PurchaseDetail extends Purchase {
  status_history: PurchaseStatusHistoryEntry[];
}

export interface CustomerDashboard {
  customer_name: string;
  email: string;
  state_code: string | null;
  state_name: string | null;
  member_since: string;
  active_plan: Purchase | null;
  pending_plan: Purchase | null;
  recent_purchases: Purchase[];
  total_purchases: number;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface ProfileUpdatePayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}
