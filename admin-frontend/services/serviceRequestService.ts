import { api } from "@/lib/api";
import type {
  AcUnit,
  ActivityEvent,
  AppointmentPayload,
  EligibleTechnician,
  Photo,
  PhotoCategory,
  PhotoUploadTicket,
  ReportPayload,
  ServiceRequestDetail,
  ServiceRequestListItem,
  ServiceRequestStatus,
  Technician,
  TechnicianPayload,
  TechnicianProfilePayload,
} from "@/types";

/*
 * Service requests, technicians and photos. Every path maps one-to-one to a
 * backend route; the backend re-checks role, ownership and status on each call.
 */

const base = (id: number) => `/api/service-requests/${id}`;

/* -------------------------------- Admin ------------------------------- */

export function fetchServiceRequests(params: {
  status?: ServiceRequestStatus | "";
  search?: string;
  technicianId?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<ServiceRequestListItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.technicianId) query.set("technician_id", String(params.technicianId));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const suffix = query.toString() ? `?${query}` : "";
  return api.get<ServiceRequestListItem[]>(`/api/service-requests${suffix}`);
}

export function startReview(id: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/review`, {});
}

export function approveRequest(id: number, note?: string) {
  return api.post<ServiceRequestDetail>(`${base(id)}/approve`, { note: note || null });
}

export function rejectRequest(id: number, reason: string) {
  return api.post<ServiceRequestDetail>(`${base(id)}/reject`, { reason });
}

export function assignTechnician(id: number, technicianId: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/assign`, { technician_id: technicianId });
}

export function requestMoreInfo(id: number, reason: string) {
  return api.post<ServiceRequestDetail>(`${base(id)}/request-info`, { reason });
}

export function fetchEligibleTechnicians(id: number) {
  return api.get<EligibleTechnician[]>(`${base(id)}/eligible-technicians`);
}

/** Assign (if needed) and confirm a visit. Date/time are in the property's time zone. */
export function scheduleAppointment(id: number, payload: AppointmentPayload) {
  return api.post<ServiceRequestDetail>(`${base(id)}/appointment`, payload);
}

/** One step: approve (if needed), assign and book. Nothing changes if any check fails. */
export function confirmClaim(id: number, payload: AppointmentPayload) {
  return api.post<ServiceRequestDetail>(`${base(id)}/confirm`, payload);
}

export function cancelRequest(id: number, note?: string) {
  return api.post<ServiceRequestDetail>(`${base(id)}/cancel`, { note: note || null });
}

/* ------------------------------- Shared ------------------------------- */

export function fetchServiceRequest(id: number) {
  return api.get<ServiceRequestDetail>(base(id));
}

export function fetchHistory(id: number) {
  return api.get<ActivityEvent[]>(`${base(id)}/history`);
}

/* ----------------------------- Technician ----------------------------- */

export function fetchAssignedJobs(includeClosed = false) {
  const suffix = includeClosed ? "?include_closed=true" : "";
  return api.get<ServiceRequestListItem[]>(`/api/service-requests/assigned${suffix}`);
}

export function startInspection(id: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/start-inspection`, {});
}

export function updateReport(id: number, payload: ReportPayload) {
  return api.put<ServiceRequestDetail>(`${base(id)}/report`, payload);
}

export function requestCustomerApproval(id: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/request-customer-approval`, {});
}

export function startWork(id: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/start-work`, {});
}

export function completeJob(id: number) {
  return api.post<ServiceRequestDetail>(`${base(id)}/complete`, {});
}

/* ---------------------------- Technicians ----------------------------- */

export function fetchTechnicians(activeOnly = false) {
  return api.get<Technician[]>(`/api/technicians${activeOnly ? "?active_only=true" : ""}`);
}

export function createTechnician(payload: TechnicianPayload) {
  return api.post<Technician>("/api/technicians", payload);
}

export function updateTechnician(
  id: number,
  payload: { is_active?: boolean; phone?: string | null },
) {
  return api.patch<Technician>(`/api/technicians/${id}`, payload);
}

export function updateTechnicianProfile(id: number, payload: TechnicianProfilePayload) {
  return api.put<Technician>(`/api/technicians/${id}/profile`, payload);
}

/* ------------------------------ AC units ------------------------------ */

export function fetchCustomerAcUnits(customerId: number) {
  return api.get<AcUnit[]>(`/api/ac-units?customer_id=${customerId}`);
}

/* ------------------------------- Photos ------------------------------- */

export function requestPhotoUpload(
  requestId: number,
  body: { category: PhotoCategory; filename: string; content_type: string; size_bytes: number },
) {
  return api.post<PhotoUploadTicket>(`${base(requestId)}/photos/upload-url`, body);
}

export function confirmPhoto(photoId: number) {
  return api.post<Photo>(`/api/photos/${photoId}/confirm`, {});
}
