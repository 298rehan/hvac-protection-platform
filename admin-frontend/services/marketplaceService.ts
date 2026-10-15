import { api } from "@/lib/api";
import type {
  AppointmentPayload,
  CatalogService,
  CategoryPayload,
  DiscountCode,
  DiscountPayload,
  OrderDetail,
  OrderListItem,
  OrderStatus,
  OrderTechnician,
  PaymentStatus,
  ServiceCategory,
  ServicePayload,
} from "@/types";

/*
 * Service catalog and service orders. Every path maps to one backend route;
 * the backend re-checks the admin / technician role and order status each time.
 */

/* ------------------------------ Catalog ------------------------------ */

export function fetchAdminCategories() {
  return api.get<ServiceCategory[]>("/api/catalog/admin/categories");
}

export function createCategory(payload: CategoryPayload) {
  return api.post<ServiceCategory>("/api/catalog/admin/categories", payload);
}

export function updateCategory(id: number, payload: CategoryPayload) {
  return api.put<ServiceCategory>(`/api/catalog/admin/categories/${id}`, payload);
}

export function fetchAdminServices() {
  return api.get<CatalogService[]>("/api/catalog/admin/services");
}

/** There is no single-service admin route, so this filters the full list. */
export async function fetchAdminService(id: number): Promise<CatalogService | null> {
  const services = await fetchAdminServices();
  return services.find((s) => s.id === id) ?? null;
}

export function createService(payload: ServicePayload) {
  return api.post<CatalogService>("/api/catalog/admin/services", payload);
}

export function updateService(id: number, payload: ServicePayload) {
  return api.put<CatalogService>(`/api/catalog/admin/services/${id}`, payload);
}

export function fetchDiscounts() {
  return api.get<DiscountCode[]>("/api/catalog/admin/discounts");
}

export function createDiscount(payload: DiscountPayload) {
  return api.post<DiscountCode>("/api/catalog/admin/discounts", payload);
}

export function updateDiscount(id: number, payload: DiscountPayload) {
  return api.put<DiscountCode>(`/api/catalog/admin/discounts/${id}`, payload);
}

/* ------------------------------- Orders ------------------------------ */

const order = (id: number) => `/api/orders/${id}`;

export function fetchOrders(params: {
  status?: OrderStatus | "";
  paymentStatus?: PaymentStatus | "";
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.paymentStatus) query.set("payment_status", params.paymentStatus);
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query}` : "";
  return api.get<OrderListItem[]>(`/api/orders${suffix}`);
}

export function fetchOrder(id: number) {
  return api.get<OrderDetail>(order(id));
}

export function confirmOrder(id: number) {
  return api.post<OrderDetail>(`${order(id)}/confirm`, {});
}

export function fetchOrderTechnicians(id: number) {
  return api.get<OrderTechnician[]>(`${order(id)}/eligible-technicians`);
}

/** Assign a technician and book the visit. Date and time are in the property's time zone. */
export function bookOrderVisit(id: number, payload: AppointmentPayload) {
  return api.post<OrderDetail>(`${order(id)}/appointment`, payload);
}

export function setFinalPrices(id: number, prices: { item_id: number; unit_price: string }[]) {
  return api.put<OrderDetail>(`${order(id)}/final-prices`, { prices });
}

export function markOrderPaid(id: number) {
  return api.post<OrderDetail>(`${order(id)}/mark-paid`, {});
}

export function completeOrder(id: number) {
  return api.post<OrderDetail>(`${order(id)}/complete`, {});
}

export function cancelOrder(id: number, note?: string) {
  return api.post<OrderDetail>(`${order(id)}/cancel`, { note: note || null });
}

/* ----------------------------- Technician ---------------------------- */

export function fetchAssignedOrders(includeClosed = false) {
  return api.get<OrderListItem[]>(`/api/orders/assigned${includeClosed ? "?include_closed=true" : ""}`);
}

export function startOrderVisit(id: number) {
  return api.post<OrderDetail>(`${order(id)}/start`, {});
}
