"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UsersPanel from "./UsersPanel";

interface Device {
  id: string;
  hostname: string;
  type: string;
  os: string;
  health: string;
  user: string | null;
  ip: string | null;
  lastSeenAt: string | null;
  tamperProtection: boolean | null;
}

interface DevicesResponse {
  summary: { total: number; byHealth: Record<string, number> };
  devices: Device[];
  fetchedAt: string;
}

export default function DeviceDashboard({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const router = useRouter();
  const [showUsers, setShowUsers] = useState(false);
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load devices");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.devices;
    return data.devices.filter((d) =>
      [d.hostname, d.user, d.os, d.ip, d.health].some((v) => v?.toLowerCase().includes(q))
    );
  }, [data, query]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>Enrolled devices</h1>
          <p className="muted">Signed in as {email}</p>
        </div>
        <div className="actions">
          <button onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {isAdmin && (
            <button className="secondary" onClick={() => setShowUsers((v) => !v)}>
              {showUsers ? "Hide users" : "Manage users"}
            </button>
          )}
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {isAdmin && showUsers && <UsersPanel currentEmail={email} />}

      {error && <p className="error">{error}</p>}

      {data && (
        <section className="stats">
          <div className="card stat">
            <span className="muted">Total</span>
            <strong>{data.summary.total}</strong>
          </div>
          {Object.entries(data.summary.byHealth).map(([health, count]) => (
            <div className="card stat" key={health}>
              <span className="muted">{health}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </section>
      )}

      <input
        className="search"
        placeholder="Search hostname, user, OS, IP…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Type</th>
              <th>OS</th>
              <th>User</th>
              <th>IP</th>
              <th>Health</th>
              <th>Tamper</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>{d.hostname}</td>
                <td>{d.type}</td>
                <td>{d.os}</td>
                <td>{d.user ?? "—"}</td>
                <td>{d.ip ?? "—"}</td>
                <td>
                  <span className={`badge ${d.health}`}>{d.health}</span>
                </td>
                <td>{d.tamperProtection === null ? "—" : d.tamperProtection ? "On" : "Off"}</td>
                <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="muted center-text">
                  No devices found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
