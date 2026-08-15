"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { InstallButton } from "./InstallButton";

function NavLink({ href, label }: { href: string; label: string }): React.ReactElement {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link href={href} className={`nav-link ${active ? "active" : ""}`}>
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const { status, user, logout } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnread(0);
      return;
    }
    let active = true;
    void api.notifications
      .list({ limit: 50 })
      .then((r) => {
        if (active) setUnread(r.items.filter((n) => n.readAt === null).length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [status]);

  return (
    <div className="shell">
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <img src="/icon.svg" alt="" />
            <span>Gem</span>
          </Link>
          <nav className="nav-links">
            <NavLink href="/gems" label="Browse" />
            {status === "authenticated" && <NavLink href="/gems/new" label="Sell" />}
            {status === "authenticated" && (
              <Link
                href="/notifications"
                className={`nav-link ${pathname === "/notifications" ? "active" : ""}`}
              >
                Notifications
                {unread > 0 && <span className="nav-count">{unread}</span>}
              </Link>
            )}
          </nav>
          <div className="nav-spacer" />
          <InstallButton />
          {status === "loading" ? (
            <span className="spinner" />
          ) : status === "authenticated" && user ? (
            <div className="row" style={{ gap: 10 }}>
              <Link href="/profile" className="nav-link">
                {user.name.split(" ")[0]}
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <Link href="/login" className="nav-link">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-sm">
                Join
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
