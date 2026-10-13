import { api } from "@/lib/api";
import type {
  ActivityEvent,
  PhotoCategory,
  PhotoContentType,
  PhotoUploadResponse,
  ServiceRequestDetail,
  ServiceRequestListItem,
  ServiceType,
} from "@/types";

export function fetchMyServiceRequests(): Promise<ServiceRequestListItem[]> {
  return api.get<ServiceRequestListItem[]>("/api/service-requests/me");
}

export function fetchServiceRequest(requestId: number): Promise<ServiceRequestDetail> {
  return api.get<ServiceRequestDetail>(`/api/service-requests/${requestId}`);
}

export function fetchServiceRequestHistory(requestId: number): Promise<ActivityEvent[]> {
  return api.get<ActivityEvent[]>(`/api/service-requests/${requestId}/history`);
}

export function createServiceRequest(payload: {
  ac_unit_id: number;
  service_type: ServiceType;
  description: string;
}): Promise<ServiceRequestDetail> {
  return api.post<ServiceRequestDetail>("/api/service-requests", payload);
}

export function cancelServiceRequest(
  requestId: number,
  note: string | null,
): Promise<ServiceRequestDetail> {
  return api.post<ServiceRequestDetail>(`/api/service-requests/${requestId}/cancel`, { note });
}

export function decideProposedWork(
  requestId: number,
  approve: boolean,
  note: string | null,
): Promise<ServiceRequestDetail> {
  return api.post<ServiceRequestDetail>(`/api/service-requests/${requestId}/customer-decision`, {
    approve,
    note,
  });
}

export function requestServiceRequestPhotoUpload(
  requestId: number,
  category: PhotoCategory,
  file: { filename: string; content_type: PhotoContentType; size_bytes: number },
): Promise<PhotoUploadResponse> {
  return api.post<PhotoUploadResponse>(`/api/service-requests/${requestId}/photos/upload-url`, {
    ...file,
    category,
  });
}
