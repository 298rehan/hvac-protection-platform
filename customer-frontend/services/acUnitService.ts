import { ApiError, api } from "@/lib/api";
import { fetchDashboard } from "@/services/purchaseService";
import { fetchPlan } from "@/services/planService";
import type {
  AcUnit,
  AcUnitPayload,
  Photo,
  PhotoContentType,
  PhotoUploadResponse,
  Purchase,
} from "@/types";

export function fetchMyAcUnits(): Promise<AcUnit[]> {
  return api.get<AcUnit[]>("/api/ac-units/me");
}

export function fetchAcUnit(unitId: number): Promise<AcUnit> {
  return api.get<AcUnit>(`/api/ac-units/${unitId}`);
}

export function createAcUnit(payload: AcUnitPayload): Promise<AcUnit> {
  return api.post<AcUnit>("/api/ac-units", payload);
}

export function updateAcUnit(unitId: number, payload: Partial<AcUnitPayload>): Promise<AcUnit> {
  return api.patch<AcUnit>(`/api/ac-units/${unitId}`, payload);
}

export function deleteAcUnit(unitId: number): Promise<void> {
  return api.delete<void>(`/api/ac-units/${unitId}`);
}

export function attachAcUnitToCurrentPlan(unitId: number): Promise<AcUnit> {
  return api.post<AcUnit>(`/api/ac-units/${unitId}/attach-current-plan`);
}

export function requestAcUnitPhotoUpload(
  unitId: number,
  file: { filename: string; content_type: PhotoContentType; size_bytes: number },
): Promise<PhotoUploadResponse> {
  return api.post<PhotoUploadResponse>(`/api/ac-units/${unitId}/photos/upload-url`, file);
}

export function confirmPhoto(photoId: number): Promise<Photo> {
  return api.post<Photo>(`/api/photos/${photoId}/confirm`);
}

export function deletePhoto(photoId: number): Promise<void> {
  return api.delete<void>(`/api/photos/${photoId}`);
}

export interface Coverage {
  /** The customer's pending or active purchase, if any. */
  purchase: Purchase | null;
  /** Units allowed under that purchase, or null if it could not be determined. */
  maxUnits: number | null;
}

/**
 * The current plan and how many AC units it covers.
 *
 * The purchase comes from the dashboard endpoint (same source as My Plan); the
 * unit limit comes from the plan's public detail for the purchase's state.
 */
export async function fetchCoverage(): Promise<Coverage> {
  const dashboard = await fetchDashboard();
  const purchase = dashboard.active_plan ?? dashboard.pending_plan;
  if (!purchase) return { purchase: null, maxUnits: null };
  try {
    const plan = await fetchPlan(purchase.plan_id, purchase.state_code);
    return { purchase, maxUnits: plan.max_ac_units };
  } catch (error) {
    // A plan withdrawn from sale still covers existing purchases; the backend
    // enforces the real limit, so the UI just stops showing a number.
    if (error instanceof ApiError && error.status === 404) return { purchase, maxUnits: null };
    throw error;
  }
}
