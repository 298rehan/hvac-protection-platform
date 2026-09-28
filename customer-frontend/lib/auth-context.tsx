"use client";

/**
 * Client-side session state.
 *
 * The JWT is kept in localStorage and replayed on every request. This is only
 * a convenience layer: the backend independently verifies the token and the
 * CUSTOMER role on every protected endpoint, so nothing here is a security
 * boundary.
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
import type { RegisterPayload, TokenResponse, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  /** True until the stored token has been checked against the API. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/api/auth/me");
      setUserState(me);
    } catch (error) {
      // An expired or tampered token just means "signed out".
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearToken();
      }
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<TokenResponse>(
      "/api/auth/login",
      { email, password },
      { auth: false },
    );
    setToken(data.access_token);
    setUserState(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await api.post<TokenResponse>("/api/auth/register", payload, {
      auth: false,
    });
    setToken(data.access_token);
    setUserState(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUserState(null);
    router.push("/");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refresh, setUser: setUserState }),
    [user, loading, login, register, logout, refresh],
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
