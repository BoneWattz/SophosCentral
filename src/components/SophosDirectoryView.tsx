"use client";

import { useState } from "react";
import RemoteTable, { type RemoteColumn } from "./RemoteTable";

type Tab = "users" | "groups";

interface DirUser {
  id: string;
  name: string;
  email: string | null;
  groups: string[];
  groupCount: number;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface DirGroup {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const userColumns: RemoteColumn<DirUser>[] = [
  { header: "Name", render: (u) => u.name || "—", sortKey: "name" },
  { header: "Email", render: (u) => u.email ?? "—", sortKey: "email" },
  {
    header: "Groups",
    render: (u) =>
      u.groupCount === 0 ? (
        "—"
      ) : (
        <>
          {u.groups.slice(0, 2).map((g) => (
            <span key={g} className="badge" style={{ marginRight: 4 }}>
              {g}
            </span>
          ))}
          {u.groupCount > 2 && <span className="muted">+{u.groupCount - 2} more</span>}
        </>
      ),
  },
  { header: "Source", render: (u) => u.source },
  { header: "Created", render: (u) => fmt(u.createdAt), sortKey: "createdAt" },
  { header: "Updated", render: (u) => fmt(u.updatedAt), sortKey: "updatedAt" },
];

const groupColumns: RemoteColumn<DirGroup>[] = [
  { header: "Name", render: (g) => g.name || "—", sortKey: "name" },
  { header: "Description", render: (g) => g.description ?? "—" },
  { header: "Users", render: (g) => g.userCount.toLocaleString() },
  { header: "Source", render: (g) => g.source },
  { header: "Created", render: (g) => fmt(g.createdAt), sortKey: "createdAt" },
  { header: "Updated", render: (g) => fmt(g.updatedAt), sortKey: "updatedAt" },
];

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: "users", label: "Users", blurb: "Users synced to Sophos Central" },
  { key: "groups", label: "Groups", blurb: "User groups in Sophos Central" },
];

export default function SophosDirectoryView({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // A tab loads the first time it's opened, then stays mounted (hidden) so its page, sort and search survive switching.
  const [visited, setVisited] = useState<Set<Tab>>(new Set([initialTab]));
  const [refresh, setRefresh] = useState<Record<Tab, number>>({ users: 0, groups: 0 });
  const [errors, setErrors] = useState<Record<Tab, string | null>>({ users: null, groups: null });

  function selectTab(next: Tab) {
    setTab(next);
    setVisited((v) => new Set(v).add(next));
    // Keep the tab in the URL so a reload or a shared link opens the same tab (no re-render needed).
    window.history.replaceState(null, "", next === "users" ? "/dashboard/sophos" : `/dashboard/sophos?tab=${next}`);
  }

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sophos Users &amp; Groups</h1>
          <p className="muted">{active.blurb} · newest first</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setRefresh((r) => ({ ...r, [tab]: r[tab] + 1 }))}>
            Refresh
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errors[tab] && <p className="error" style={{ marginBottom: 12 }}>{errors[tab]}</p>}

      {visited.has("users") && (
        <div hidden={tab !== "users"}>
          <RemoteTable<DirUser>
            endpoint="/api/sophos/directory?type=users"
            columns={userColumns}
            rowKey={(u) => u.id}
            searchPlaceholder="Search name or email…"
            emptyText="No users found"
            refreshToken={refresh.users}
            onError={(m) => setErrors((e) => ({ ...e, users: m }))}
          />
        </div>
      )}
      {visited.has("groups") && (
        <div hidden={tab !== "groups"}>
          <RemoteTable<DirGroup>
            endpoint="/api/sophos/directory?type=groups"
            columns={groupColumns}
            rowKey={(g) => g.id}
            searchPlaceholder="Search group name…"
            emptyText="No groups found"
            refreshToken={refresh.groups}
            onError={(m) => setErrors((e) => ({ ...e, groups: m }))}
          />
        </div>
      )}
    </>
  );
}
