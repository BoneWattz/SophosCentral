"use client";

import { useState } from "react";
import RemoteTable, { type RemoteColumn } from "./RemoteTable";

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

export default function SophosDirectoryView({ kind }: { kind: "users" | "groups" }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isUsers = kind === "users";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isUsers ? "Sophos Users" : "Sophos Groups"}</h1>
          <p className="muted">
            {isUsers ? "Users synced to Sophos Central" : "User groups in Sophos Central"} · newest first
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setRefreshToken((n) => n + 1)}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      {isUsers ? (
        <RemoteTable<DirUser>
          endpoint="/api/sophos/directory?type=users"
          columns={userColumns}
          rowKey={(u) => u.id}
          searchPlaceholder="Search name or email…"
          emptyText="No users found"
          refreshToken={refreshToken}
          onError={setError}
        />
      ) : (
        <RemoteTable<DirGroup>
          endpoint="/api/sophos/directory?type=groups"
          columns={groupColumns}
          rowKey={(g) => g.id}
          searchPlaceholder="Search group name…"
          emptyText="No groups found"
          refreshToken={refreshToken}
          onError={setError}
        />
      )}
    </>
  );
}
