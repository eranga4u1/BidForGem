"use client";

import type { PublicUser } from "@gem/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, GemApiError, UnauthenticatedError } from "./api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: PublicUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      // The client refreshes off the stored refresh token if the access token is
      // gone (page reload); a missing/expired session surfaces as
      // UnauthenticatedError, which just means "anonymous".
      try {
        const me = await api.auth.me();
        if (active) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (active) setStatus("anonymous");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const { user: u } = await api.auth.login({ email, password });
    setUser(u);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<void> => {
      const { user: u } = await api.auth.register({ name, email, password });
      setUser(u);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    await api.auth.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const deleteAccount = useCallback(async (password: string): Promise<void> => {
    await api.auth.deleteAccount(password);
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
      if (
        err instanceof UnauthenticatedError ||
        (err instanceof GemApiError && err.status === 401)
      ) {
        setUser(null);
        setStatus("anonymous");
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateName, refreshUser, deleteAccount }),
    [user, status, login, register, logout, updateName, refreshUser, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { GemApiError };
