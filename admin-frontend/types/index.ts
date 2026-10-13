/**
 * Types mirroring the FastAPI response schemas used by the admin panel.
 * Keep in sync with backend/app/schemas/*.py.
 */

export type UserRole = "CUSTOMER" | "ADMIN" | "TECHNICIAN";

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
  max_ac_units: number;
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
  max_ac_units: number;
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

/* ------------------------------------------------------------------------ *
 * Maintenance workflow: AC units, service requests, photos, technicians.
 * Mirrors backend/app/schemas/{ac_unit,service_request,photo}.py.
 * ------------------------------------------------------------------------ */

export type ServiceRequestStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ASSIGNED"
  | "INSPECTION_IN_PROGRESS"
  | "AWAITING_CUSTOMER_APPROVAL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ServiceType =
  | "ROUTINE_MAINTENANCE"
  | "NOT_COOLING"
  | "NOT_HEATING"
  | "WATER_LEAK"
  | "STRANGE_NOISE"
  | "VISIBLE_DAMAGE"
  | "OTHER";

export type AcType =
  | "CENTRAL_SPLIT"
  | "DUCTLESS_MINI_SPLIT"
  | "HEAT_PUMP"
  | "PACKAGED"
  | "WINDOW"
  | "PORTABLE"
  | "OTHER";

export type ReportedCondition = "GOOD" | "FAIR" | "POOR" | "NOT_WORKING" | "UNKNOWN";

export type PhotoCategory = "INITIAL" | "CUSTOMER" | "INSPECTION" | "BEFORE" | "AFTER";

export type PhotoStatus = "PENDING" | "UPLOADED";

export interface Photo {
  id: number;
  category: PhotoCategory;
  status: PhotoStatus;
  original_filename: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  confirmed_at: string | null;
  /** Short-lived presigned view URL; only present for verified photos. */
  url: string | null;
}

export interface AcUnitBrief {
  id: number;
  brand: string;
  model_number: string;
  serial_number: string | null;
  ac_type: AcType;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  installation_date: string | null;
  reported_condition: ReportedCondition;
}

export interface AcUnit extends AcUnitBrief {
  customer_id: number;
  purchase_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  plan_name: string | null;
  has_open_request: boolean;
  photos: Photo[];
}

export interface TechnicianBrief {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface ServiceRequestListItem {
  id: number;
  status: ServiceRequestStatus;
  service_type: ServiceType;
  created_at: string;
  updated_at: string;
  ac_unit: AcUnitBrief;
  technician: TechnicianBrief | null;
  /** Present on staff views only. */
  customer: CustomerSummary | null;
}

export interface ServiceRequestDetail extends ServiceRequestListItem {
  description: string;
  status_reason: string | null;
  inspection_findings: string | null;
  proposed_work: string | null;
  work_performed: string | null;
  parts_used: string | null;
  customer_decision_note: string | null;
  reviewed_at: string | null;
  decided_at: string | null;
  assigned_at: string | null;
  inspection_started_at: string | null;
  work_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  plan: { purchase_id: number; plan_name: string };
  photo_recommended: boolean;
  photos: Photo[];
  ac_unit_photos: Photo[];
  /** What the signed-in user may upload right now. */
  allowed_upload_categories: PhotoCategory[];
  technician_notes: string | null;
  customer_address: string | null;
}

export interface ActivityEvent {
  event_id: string;
  event_type: string;
  event_timestamp: string;
  actor_role: string;
  description: string;
  previous_status: string | null;
  new_status: string | null;
  actor_id: string | null;
  technician_id: string | null;
}

export interface ReportPayload {
  inspection_findings?: string | null;
  proposed_work?: string | null;
  work_performed?: string | null;
  parts_used?: string | null;
  technician_notes?: string | null;
}

export interface Technician {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  open_jobs: number;
}

export interface TechnicianPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  password: string;
}

export interface PhotoUploadTicket {
  photo_id: number;
  upload: { url: string; fields: Record<string, string> };
  expires_in: number;
  max_bytes: number;
}
