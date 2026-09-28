import { api } from "@/lib/api";
import type { PublicPlan, Region } from "@/types";

/** Plans that are active and sold in `stateCode`, priced for that state. */
export function fetchPlans(stateCode: string): Promise<PublicPlan[]> {
  return api.get<PublicPlan[]>(`/api/plans?state=${encodeURIComponent(stateCode)}`, {
    auth: false,
  });
}

/** Plans available where the signed-in customer lives. */
export function fetchMyPlans(): Promise<PublicPlan[]> {
  return api.get<PublicPlan[]>("/api/plans/mine");
}

export function fetchPlan(planId: number, stateCode: string): Promise<PublicPlan> {
  return api.get<PublicPlan>(
    `/api/plans/${planId}?state=${encodeURIComponent(stateCode)}`,
    { auth: false },
  );
}

/** Every US state - used by the registration and profile forms. */
export function fetchRegions(): Promise<Region[]> {
  return api.get<Region[]>("/api/regions", { auth: false });
}

/** Only the states we currently sell plans in. */
export function fetchServiceAreas(): Promise<Region[]> {
  return api.get<Region[]>("/api/regions/service-areas", { auth: false });
}
