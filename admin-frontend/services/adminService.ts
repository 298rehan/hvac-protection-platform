import { api } from "@/lib/api";
import type {
  AdminDashboard,
  AdminPurchase,
  CustomerSummary,
  Plan,
  PlanPayload,
  Purchase,
  PurchaseDetail,
  PurchaseStatus,
  Region,
  User,
} from "@/types";

/* -------------------------------- Dashboard ------------------------------- */

export function fetchDashboard(): Promise<AdminDashboard> {
  return api.get<AdminDashboard>("/api/admin/dashboard");
}

/* -------------------------------- Customers ------------------------------- */

export function fetchCustomers(params: {
  search?: string;
  state?: string;
} = {}): Promise<CustomerSummary[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.state) query.set("state", params.state);
  const suffix = query.toString() ? `?${query}` : "";
  return api.get<CustomerSummary[]>(`/api/customers${suffix}`);
}

export function fetchCustomer(customerId: number): Promise<User> {
  return api.get<User>(`/api/customers/${customerId}`);
}

export function fetchCustomerPurchases(customerId: number): Promise<Purchase[]> {
  return api.get<Purchase[]>(`/api/customers/${customerId}/purchases`);
}

export function fetchCustomerCurrentPlan(customerId: number): Promise<Purchase | null> {
  return api.get<Purchase | null>(`/api/customers/${customerId}/current-plan`);
}

/* ---------------------------------- Plans --------------------------------- */

export function fetchPlans(): Promise<Plan[]> {
  return api.get<Plan[]>("/api/plans/admin/all");
}

export function fetchPlan(planId: number): Promise<Plan> {
  return api.get<Plan>(`/api/plans/${planId}/admin`);
}

export function createPlan(payload: PlanPayload): Promise<Plan> {
  return api.post<Plan>("/api/plans", payload);
}

export function updatePlan(planId: number, payload: Partial<PlanPayload>): Promise<Plan> {
  return api.put<Plan>(`/api/plans/${planId}`, payload);
}

export function deletePlan(planId: number): Promise<void> {
  return api.delete<void>(`/api/plans/${planId}`);
}

/* -------------------------------- Purchases ------------------------------- */

export function fetchPurchases(params: {
  status?: PurchaseStatus | "";
  search?: string;
  planId?: number;
} = {}): Promise<AdminPurchase[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.planId) query.set("plan_id", String(params.planId));
  const suffix = query.toString() ? `?${query}` : "";
  return api.get<AdminPurchase[]>(`/api/purchases${suffix}`);
}

export function fetchPurchase(purchaseId: number): Promise<PurchaseDetail> {
  return api.get<PurchaseDetail>(`/api/purchases/${purchaseId}`);
}

/** PENDING -> ACTIVE approves; PENDING/ACTIVE -> CANCELLED cancels. */
export function updatePurchaseStatus(
  purchaseId: number,
  status: PurchaseStatus,
  note?: string,
): Promise<PurchaseDetail> {
  return api.patch<PurchaseDetail>(`/api/purchases/${purchaseId}/status`, {
    status,
    note: note || null,
  });
}

/* --------------------------------- Regions -------------------------------- */

export function fetchRegions(): Promise<Region[]> {
  return api.get<Region[]>("/api/regions", { auth: false });
}
