"use client";

import Link from "next/link";
import { useDevices } from "@/lib/useDevices";

export default function OverviewView() {
  const { data, loading, error, reload } = useDevices();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          {data && (
            <p className="muted">Last updated {new Date(data.fetchedAt).toLocaleString()}</p>
          )}
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={reload} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/dashboard/devices" className="btn" style={{ textDecoration: "none" }}>
            View all devices
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="stats">
        <div className="card stat">
          <span className="label">Enrolled devices</span>
          <strong>{data ? data.summary.total : "—"}</strong>
        </div>
        {data &&
          Object.entries(data.summary.byHealth).map(([health, count]) => (
            <div className="card stat" key={health}>
              <span className="label">{health}</span>
              <strong>{count}</strong>
            </div>
          ))}
      </section>
    </>
  );
}
