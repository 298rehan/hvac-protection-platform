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
  /** How many AC units one purchase of this plan covers. */
  max_ac_units: number;
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

/* ------------------------------------------------------------------ *
 * Maintenance workflow: AC units, photos, service requests.
 * Mirrors backend/app/schemas/{ac_unit,photo,service_request}.py.
 * ------------------------------------------------------------------ */

export type AcType =
  | "CENTRAL_SPLIT"
  | "DUCTLESS_MINI_SPLIT"
  | "HEAT_PUMP"
  | "PACKAGED"
  | "WINDOW"
  | "PORTABLE"
  | "OTHER";

export type ReportedCondition = "GOOD" | "FAIR" | "POOR" | "NOT_WORKING" | "UNKNOWN";

export type ServiceType =
  | "ROUTINE_MAINTENANCE"
  | "NOT_COOLING"
  | "NOT_HEATING"
  | "WATER_LEAK"
  | "STRANGE_NOISE"
  | "VISIBLE_DAMAGE"
  | "OTHER";

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

export type PhotoCategory = "INITIAL" | "CUSTOMER" | "INSPECTION" | "BEFORE" | "AFTER";

export type PhotoStatus = "PENDING" | "UPLOADED";

export type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";

export interface Photo {
  id: number;
  category: PhotoCategory;
  status: PhotoStatus;
  original_filename: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  confirmed_at: string | null;
  /** Short-lived presigned view URL; only set for verified photos. */
  url: string | null;
}

export interface PhotoUploadResponse {
  photo_id: number;
  upload: { url: string; fields: Record<string, string> };
  expires_in: number;
  max_bytes: number;
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

export interface AcUnitPayload {
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
  notes: string | null;
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
  allowed_upload_categories: PhotoCategory[];
}

/** Customer-safe activity event (staff identifiers are removed by the API). */
export interface ActivityEvent {
  event_id: string;
  event_type: string;
  event_timestamp: string;
  actor_role: string;
  description: string;
  previous_status: string | null;
  new_status: string | null;
}
