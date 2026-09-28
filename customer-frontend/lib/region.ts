"use client";

/**
 * The visitor's chosen service region.
 *
 * Signed-in customers always use the state on their account. Anonymous visitors
 * pick one on the Plans page; the choice is remembered in localStorage so the
 * catalogue stays priced correctly as they browse.
 */

const REGION_KEY = "hvac_region";

export function getStoredRegion(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REGION_KEY);
}

export function storeRegion(stateCode: string): void {
  window.localStorage.setItem(REGION_KEY, stateCode.toUpperCase());
}
