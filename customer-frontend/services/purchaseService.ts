import { api } from "@/lib/api";
import type { BillingCycle, CustomerDashboard, Purchase, PurchaseDetail } from "@/types";

/** Demo checkout: creates a PENDING purchase. No payment is processed. */
export function createPurchase(
  planId: number,
  billingCycle: BillingCycle,
): Promise<Purchase> {
  return api.post<Purchase>("/api/purchases", {
    plan_id: planId,
    billing_cycle: billingCycle,
  });
}

export function fetchMyPurchases(): Promise<Purchase[]> {
  return api.get<Purchase[]>("/api/purchases/me");
}

export function fetchPurchase(purchaseId: number): Promise<PurchaseDetail> {
  return api.get<PurchaseDetail>(`/api/purchases/${purchaseId}`);
}

export function fetchDashboard(): Promise<CustomerDashboard> {
  return api.get<CustomerDashboard>("/api/customers/me/dashboard");
}
