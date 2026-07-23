"use client";

import type { PublicUser } from "@gem/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, authApi, tokenStore } from "./api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: PublicUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // On mount, restore the session from a stored refresh/access token.
  useEffect(() => {
    let active = true;
    async function restore(): Promise<void> {
      if (!tokenStore.refresh && !tokenStore.access) {
        if (active) setStatus("anonymous");
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (active) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        tokenStore.clear();
        if (active) setStatus("anonymous");
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await authApi.login({ email, password });
    tokenStore.set(res.tokens);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<void> => {
      const res = await authApi.register({ name, email, password });
      tokenStore.set(res.tokens);
      setUser(res.user);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    await authApi.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const updateName = useCallback(async (name: string): Promise<void> => {
    const res = await authApi.updateName(name);
    const nextUser = "user" in res ? res.user : null;
    if (nextUser) setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateName }),
    [user, status, login, register, logout, updateName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
