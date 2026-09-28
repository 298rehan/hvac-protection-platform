"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side guard for the customer dashboard.
 *
 * This only controls what is rendered. Every protected endpoint independently
 * verifies the JWT and the CUSTOMER role server-side, so removing this guard
 * would not expose any data.
 */
export function RequireAuth({
  children,
  redirectTo = "/login",
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const next = window.location.pathname + window.location.search;
      router.replace(`${redirectTo}?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router, redirectTo]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}
