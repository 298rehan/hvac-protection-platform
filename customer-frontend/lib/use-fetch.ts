"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/api";

type State<T> = { key: string; data: T | null; error: string | null };

/**
 * Load data for `key`; pass null to skip. State is only set inside the
 * promise callbacks, and results are tagged with the key they belong to, so a
 * slow old response never overwrites a newer one.
 */
export function useFetch<T>(key: string | null, fetcher: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State<T>>({ key: "", data: null, error: null });
  const fullKey = key === null ? null : `${key}#${version}`;

  useEffect(() => {
    if (fullKey === null) return;
    let cancelled = false;
    fetcher()
      .then((data) => !cancelled && setState({ key: fullKey, data, error: null }))
      .catch((error) => !cancelled && setState({ key: fullKey, data: null, error: errorMessage(error) }));
    return () => {
      cancelled = true;
    };
    // The fetcher is recreated each render; `fullKey` decides when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state.key === fullKey;
  return {
    data: current ? state.data : null,
    // Keep showing the previous data while a reload is in flight.
    staleData: state.data,
    error: current ? state.error : null,
    loading: fullKey !== null && !current,
    reload,
    setData: (data: T) => setState({ key: fullKey ?? "", data, error: null }),
  };
}
