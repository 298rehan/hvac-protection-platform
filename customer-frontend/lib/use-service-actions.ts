"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { addToCart } from "@/services/marketplaceService";
import type { CatalogService, SelectionItem } from "@/types/marketplace";

export function defaultItem(service: CatalogService): SelectionItem {
  return {
    service_id: service.id,
    quantity: 1,
    frequency: service.allowed_frequencies.includes("ONE_TIME") ? "ONE_TIME" : service.allowed_frequencies[0],
    addon_ids: [],
  };
}

/** Link to checkout for a single service, without creating a plan or cart. */
export function singleServiceCheckoutUrl(item: SelectionItem): string {
  const params = new URLSearchParams({
    service: String(item.service_id),
    qty: String(item.quantity),
    freq: item.frequency,
  });
  if (item.addon_ids.length) params.set("addons", item.addon_ids.join(","));
  return `/checkout/services?${params}`;
}

/** Add-to-cart / add-to-plan / book-now actions that send guests to sign in first. */
export function useServiceActions() {
  const { user } = useAuth();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function ensureSignedIn(returnTo?: string): boolean {
    if (user) return true;
    const next = returnTo ?? window.location.pathname + window.location.search;
    router.push(`/login?next=${encodeURIComponent(next)}`);
    return false;
  }

  async function addServiceToCart(service: CatalogService, item: SelectionItem = defaultItem(service)) {
    if (!ensureSignedIn()) return;
    setBusyId(service.id);
    setNotice(null);
    try {
      await addToCart(item);
      setNotice({ tone: "success", text: `${service.name} was added to your cart.` });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  function addServiceToPlan(service: CatalogService) {
    const target = `/dashboard/custom-plan?add=${service.id}`;
    if (!ensureSignedIn(target)) return;
    router.push(target);
  }

  function bookNow(item: SelectionItem) {
    const target = singleServiceCheckoutUrl(item);
    if (!ensureSignedIn(target)) return;
    router.push(target);
  }

  return { busyId, notice, setNotice, addServiceToCart, addServiceToPlan, bookNow };
}
