"use client";

import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api";
import { fetchQuote } from "@/services/marketplaceService";
import type { Quote, SelectionItem } from "@/types/marketplace";

type Result = { key: string; quote: Quote | null; error: string | null };

/**
 * Debounced server-side price quote. The frontend never computes a price; it
 * only shows what POST /api/catalog/quote returns for the current selection.
 */
export function useQuote(items: SelectionItem[], options: { discountCode?: string; state?: string } = {}) {
  const key = JSON.stringify({ items, discount: options.discountCode ?? "", state: options.state ?? "" });
  const [result, setResult] = useState<Result>({ key: "", quote: null, error: null });

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchQuote(items, options)
        .then((quote) => !cancelled && setResult({ key, quote, error: null }))
        .catch((error) => !cancelled && setResult({ key, quote: null, error: errorMessage(error) }));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `key` captures every input; listing items/options too would re-run needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const empty = items.length === 0;
  const current = result.key === key;
  return {
    // While a new quote loads, keep showing the previous one.
    quote: empty ? null : result.quote,
    loading: !empty && !current,
    error: empty || !current ? null : result.error,
  };
}
