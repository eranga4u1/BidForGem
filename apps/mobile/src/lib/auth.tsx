import type { PublicUser } from "@gem/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, GemApiError } from "./api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: PublicUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      // The client refreshes off the stored refresh token when needed; a
      // missing/expired session throws UnauthenticatedError → anonymous.
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

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, deleteAccount }),
    [user, status, login, register, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { GemApiError };
