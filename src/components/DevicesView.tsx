"use client";

import DataTable, { type Column } from "./DataTable";
import { useDevices, type Device } from "@/lib/useDevices";

const columns: Column<Device>[] = [
  { header: "Hostname", render: (d) => d.hostname },
  { header: "Type", render: (d) => d.type },
  { header: "OS", render: (d) => d.os },
  { header: "User", render: (d) => d.user ?? "—" },
  { header: "IP", render: (d) => d.ip ?? "—" },
  {
    header: "Tamper",
    render: (d) => (d.tamperProtection === null ? "—" : d.tamperProtection ? "On" : "Off"),
  },
  { header: "Last seen", render: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—") },
  { header: "Status", render: (d) => <span className={`badge ${d.health}`}>{d.health}</span> },
];

const searchText = (d: Device) =>
  [d.hostname, d.user, d.os, d.ip, d.type, d.health].filter(Boolean).join(" ");

export default function DevicesView({ initialQuery }: { initialQuery: string }) {
  const { data, loading, error, reload } = useDevices();
  const devices = data?.devices ?? [];
  const healthOptions = Array.from(new Set(devices.map((d) => d.health))).sort();

  return (
    <>
      <div className="page-head">
        <h1>Devices</h1>
        <div className="actions">
          <button className="btn" onClick={reload} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

      <DataTable
        columns={columns}
        rows={devices}
        rowKey={(d) => d.id}
        searchText={searchText}
        searchPlaceholder="Search hostname, user, OS or IP…"
        initialQuery={initialQuery}
        filterOf={(d) => d.health}
        filterOptions={healthOptions}
        filterLabel="All status"
        loading={loading}
        emptyText="No devices found"
      />
    </>
  );
}
