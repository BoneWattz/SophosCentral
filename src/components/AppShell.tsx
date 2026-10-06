"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconGrid,
  IconMonitor,
  IconMoon,
  IconSearch,
  IconShield,
  IconSun,
  IconUsers,
} from "./icons";

const THEME_KEY = "theme";

export default function AppShell({
  email,
  isAdmin,
  children,
}: {
  email: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Restore the saved theme (storage can be unavailable, so never let it throw).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark") setDark(true);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {}
  }, [dark]);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/dashboard/devices?q=${encodeURIComponent(q)}` : "/dashboard/devices");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const link = (href: string, label: string, icon: ReactNode, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link href={href} className={`nav-link${active ? " active" : ""}`} title={label}>
        {icon}
        <span className="nav-label">{label}</span>
      </Link>
    );
  };

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <IconShield size={18} />
          </span>
          <span className="brand-text">
            <div className="brand-name">Sophos</div>
            <div className="brand-sub">Device Monitoring</div>
          </span>
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
        </button>

        {link("/dashboard", "Dashboard", <IconGrid />, true)}

        <div className="nav-section">GENERAL</div>
        {link("/dashboard/devices", "Devices", <IconMonitor />)}

        {isAdmin && (
          <>
            <div className="nav-section">ADMIN</div>
            {link("/dashboard/users", "Users", <IconUsers />)}
          </>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <form onSubmit={submitSearch}>
            <IconSearch size={16} />
            <input
              placeholder="Search devices — hostname, user, OS, IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <div className="topbar-right">
            <button
              className="icon-btn round"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle dark mode"
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>
            <button className="avatar" onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu">
              {(email[0] ?? "?").toUpperCase()}
            </button>
            {menuOpen && (
              <div className="menu">
                <div className="menu-email">{email}</div>
                <button onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
