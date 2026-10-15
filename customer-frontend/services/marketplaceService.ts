import { api } from "@/lib/api";
import type {
  AvailabilitySlot,
  CatalogService,
  CheckoutPayload,
  CustomPlan,
  Order,
  OrderDetail,
  Quote,
  SelectionItem,
  ServiceCategory,
  VisitWindow,
} from "@/types/marketplace";

/* --- Catalog (public) ------------------------------------------------------ */

export function fetchCategories(): Promise<ServiceCategory[]> {
  return api.get<ServiceCategory[]>("/api/catalog/categories", { auth: false });
}

export function fetchServices(filters: { category?: string; q?: string; state?: string } = {}): Promise<CatalogService[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  if (filters.state) params.set("state", filters.state);
  const query = params.toString();
  return api.get<CatalogService[]>(`/api/catalog/services${query ? `?${query}` : ""}`, { auth: false });
}

export function fetchService(slugOrId: string | number): Promise<CatalogService> {
  return api.get<CatalogService>(`/api/catalog/services/${encodeURIComponent(String(slugOrId))}`, { auth: false });
}

/** Prices are always calculated by the server from catalog data. */
export function fetchQuote(items: SelectionItem[], options: { discountCode?: string; state?: string } = {}): Promise<Quote> {
  return api.post<Quote>(
    "/api/catalog/quote",
    {
      items,
      discount_code: options.discountCode?.trim() || null,
      state: options.state || null,
    },
    { auth: false },
  );
}

export function fetchAvailability(state: string, zipCode: string, days = 14): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams({ state, zip_code: zipCode, days: String(days) });
  return api.get<AvailabilitySlot[]>(`/api/catalog/availability?${params}`, { auth: false });
}

/* --- Cart ------------------------------------------------------------------- */

export const CART_EVENT = "hvac-cart-updated";

function announceCart(cart: CustomPlan) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: cart.items.length }));
  }
}

export function fetchCart(): Promise<CustomPlan> {
  return api.get<CustomPlan>("/api/cart");
}

export async function saveCart(items: SelectionItem[]): Promise<CustomPlan> {
  const cart = await api.put<CustomPlan>("/api/cart", { items });
  announceCart(cart);
  return cart;
}

export async function clearCart(): Promise<void> {
  await api.delete<void>("/api/cart");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: 0 }));
}

/** Add one service (or replace its options if it is already in the cart). */
export async function addToCart(item: SelectionItem): Promise<CustomPlan> {
  const cart = await fetchCart();
  const others = cart.items.filter((existing) => existing.service_id !== item.service_id);
  return saveCart([...others, item]);
}

/* --- Saved custom plans ----------------------------------------------------- */

export interface PlanPayload {
  name?: string;
  ac_unit_id?: number | null;
  items: SelectionItem[];
}

export function fetchPlans(): Promise<CustomPlan[]> {
  return api.get<CustomPlan[]>("/api/custom-plans");
}

export function fetchPlanById(planId: number): Promise<CustomPlan> {
  return api.get<CustomPlan>(`/api/custom-plans/${planId}`);
}

export function createPlan(payload: PlanPayload): Promise<CustomPlan> {
  return api.post<CustomPlan>("/api/custom-plans", payload);
}

export function updatePlan(planId: number, payload: PlanPayload): Promise<CustomPlan> {
  return api.put<CustomPlan>(`/api/custom-plans/${planId}`, payload);
}

export function deletePlan(planId: number): Promise<void> {
  return api.delete<void>(`/api/custom-plans/${planId}`);
}

/* --- Orders ------------------------------------------------------------------ */

export function placeOrder(payload: CheckoutPayload): Promise<OrderDetail> {
  return api.post<OrderDetail>("/api/orders", payload);
}

export function fetchMyOrders(): Promise<Order[]> {
  return api.get<Order[]>("/api/orders/me");
}

export function fetchOrder(orderId: number): Promise<OrderDetail> {
  return api.get<OrderDetail>(`/api/orders/${orderId}`);
}

export function cancelOrder(orderId: number, note: string | null): Promise<OrderDetail> {
  return api.post<OrderDetail>(`/api/orders/${orderId}/cancel`, { note });
}

export function rescheduleOrder(orderId: number, requestedDate: string, window: VisitWindow): Promise<OrderDetail> {
  return api.post<OrderDetail>(`/api/orders/${orderId}/reschedule`, {
    requested_date: requestedDate,
    requested_window: window,
  });
}
