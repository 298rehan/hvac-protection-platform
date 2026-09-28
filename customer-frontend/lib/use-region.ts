"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { getStoredRegion, storeRegion } from "@/lib/region";
import { fetchServiceAreas } from "@/services/planService";
import type { Region } from "@/types";

interface UseRegionResult {
  /** The state code plans should be priced for, or null while resolving. */
  region: string | null;
  /** States we currently sell in, from the API. */
  serviceAreas: Region[];
  /** True while the customer's own state is being used and cannot be changed. */
  locked: boolean;
  loading: boolean;
  error: string | null;
  setRegion: (code: string) => void;
}

/**
 * Resolves which region the catalogue should be priced for.
 *
 * A signed-in customer always sees their own state - that is the state the
 * backend will use at checkout, so showing anything else would be misleading.
 * Anonymous visitors pick one, and the choice is remembered between visits.
 */
export function useRegion(): UseRegionResult {
  const { user, loading: authLoading } = useAuth();
  const [serviceAreas, setServiceAreas] = useState<Region[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchServiceAreas()
      .then((areas) => {
        if (cancelled) return;
        setServiceAreas(areas);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load service regions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Pick the effective region once auth and the service-area list have settled.
  useEffect(() => {
    if (authLoading || loading) return;

    if (user?.state) {
      setSelected(user.state);
      return;
    }

    const stored = getStoredRegion();
    if (stored && serviceAreas.some((area) => area.code === stored)) {
      setSelected(stored);
      return;
    }
    setSelected(serviceAreas[0]?.code ?? null);
  }, [authLoading, loading, user, serviceAreas]);

  const setRegion = useCallback((code: string) => {
    setSelected(code);
    storeRegion(code);
  }, []);

  return {
    region: selected,
    serviceAreas,
    locked: Boolean(user?.state),
    loading: loading || authLoading,
    error,
    setRegion,
  };
}
