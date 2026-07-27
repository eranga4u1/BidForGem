"use client";

import type { PublicUser } from "@gem/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, GemApiError, refreshSession, tokens } from "./api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: PublicUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!tokens.refresh) {
        if (active) setStatus("anonymous");
        return;
      }
      const token = await refreshSession();
      if (!token) {
        if (active) setStatus("anonymous");
        return;
      }
      try {
        const me = await api.auth.me();
        if (active) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        tokens.clear();
        if (active) setStatus("anonymous");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const { user: u, tokens: t } = await api.auth.login({ email, password });
    tokens.set(t);
    setUser(u);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<void> => {
      const { user: u, tokens: t } = await api.auth.register({ name, email, password });
      tokens.set(t);
      setUser(u);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    const rt = tokens.refresh;
    if (rt) await api.auth.logout(rt).catch(() => undefined);
    tokens.clear();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const updateName = useCallback(async (name: string): Promise<void> => {
    const u = await api.auth.updateMe(name);
    setUser(u);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      setUser(await api.auth.me());
    } catch (err) {
      if (err instanceof GemApiError && err.status === 401) {
        tokens.clear();
        setUser(null);
        setStatus("anonymous");
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateName, refreshUser }),
    [user, status, login, register, logout, updateName, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { GemApiError };
