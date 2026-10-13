"use client";

/**
 * Staff session state (administrators and technicians).
 *
 * Sign-in goes through `POST /api/auth/staff/login`, which rejects CUSTOMER
 * accounts outright. On top of that, every endpoint re-checks the role
 * server-side (admin-only actions, technician-only jobs), so the role check here
 * only decides which area of the app to show.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { ApiError, api, clearToken, getToken, setToken } from "@/lib/api";
import type { TokenResponse, User, UserRole } from "@/types";

export function isStaffRole(role: UserRole): boolean {
  return role === "ADMIN" || role === "TECHNICIAN";
}

/** Where each staff role lands after signing in. */
export function homeFor(role: UserRole): string {
  return role === "TECHNICIAN" ? "/technician" : "/";
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/api/auth/me");
      // Defence in depth: never treat a customer token as a staff session.
      if (!isStaffRole(me.role)) {
        clearToken();
        setUser(null);
      } else {
        setUser(me);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<TokenResponse>(
      "/api/auth/staff/login",
      { email, password },
      { auth: false },
    );
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}
