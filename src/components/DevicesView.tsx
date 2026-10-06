"use client";

import { useMemo } from "react";
import DataTable, { type Column, type FilterDef } from "./DataTable";
import { useDevices, type Device } from "@/lib/useDevices";

const DAY = 24 * 60 * 60 * 1000;

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const columns: Column<Device>[] = [
  { header: "Hostname", render: (d) => d.hostname },
  { header: "Serial number", render: (d) => d.serialNumber ?? "—" },
  { header: "Type", render: (d) => d.type },
  { header: "OS", render: (d) => d.os },
  { header: "User", render: (d) => d.user ?? "—" },
  { header: "IP", render: (d) => d.ip ?? "—" },
  { header: "MAC", render: (d) => d.mac ?? "—" },
  {
    header: "Online",
    render: (d) =>
      d.online === null ? "—" : <span className={`badge ${d.online ? "good" : ""}`}>{d.online ? "Online" : "Offline"}</span>,
  },
  {
    header: "Tamper",
    render: (d) => (d.tamperProtection === null ? "—" : d.tamperProtection ? "On" : "Off"),
  },
  { header: "Registered", render: (d) => fmtDate(d.registeredAt) },
  { header: "Last seen", render: (d) => fmtDate(d.lastSeenAt) },
  { header: "Status", render: (d) => <span className={`badge ${d.health}`}>{d.health}</span> },
];

const searchText = (d: Device) =>
  [d.hostname, d.serialNumber, d.user, d.os, d.ip, d.mac, d.type, d.health].filter(Boolean).join(" ");

const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

function lastSeenTest(d: Device, value: string) {
  if (value === "never") return !d.lastSeenAt;
  if (!d.lastSeenAt) return false;
  const age = Date.now() - new Date(d.lastSeenAt).getTime();
  if (value === "24h") return age <= DAY;
  if (value === "7d") return age <= 7 * DAY;
  if (value === "30d") return age <= 30 * DAY;
  if (value === "older") return age > 30 * DAY;
  return true;
}

export default function DevicesView({ initialQuery }: { initialQuery: string }) {
  const { data, loading, error, reload } = useDevices();
  const devices = useMemo(() => data?.devices ?? [], [data]);

  const healthOptions = useMemo(() => distinct(devices.map((d) => d.health)), [devices]);

  const filters = useMemo<FilterDef<Device>[]>(
    () => [
      {
        key: "online",
        label: "Connection",
        options: [
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
        ],
        test: (d, v) => (v === "online" ? d.online === true : d.online === false),
      },
      {
        key: "platform",
        label: "Platform",
        options: toOptions(distinct(devices.map((d) => d.platform))),
        test: (d, v) => d.platform === v,
      },
      {
        key: "os",
        label: "Operating system",
        options: toOptions(distinct(devices.map((d) => d.os))),
        test: (d, v) => d.os === v,
      },
      {
        key: "kind",
        label: "Device type",
        options: [
          { value: "workstation", label: "Workstation / laptop" },
          { value: "server", label: "Server" },
        ],
        test: (d, v) => (v === "server" ? d.isServer : !d.isServer),
      },
      {
        key: "tamper",
        label: "Tamper protection",
        options: [
          { value: "on", label: "On" },
          { value: "off", label: "Off" },
        ],
        test: (d, v) => (v === "on" ? d.tamperProtection === true : d.tamperProtection === false),
      },
      {
        key: "serial",
        label: "Serial number",
        options: [
          { value: "has", label: "Has serial number" },
          { value: "missing", label: "Missing serial number" },
        ],
        test: (d, v) => (v === "has" ? !!d.serialNumber : !d.serialNumber),
      },
      {
        key: "lastSeen",
        label: "Last seen",
        options: [
          { value: "24h", label: "Within 24 hours" },
          { value: "7d", label: "Within 7 days" },
          { value: "30d", label: "Within 30 days" },
          { value: "older", label: "Older than 30 days" },
          { value: "never", label: "Never" },
        ],
        test: lastSeenTest,
      },
    ],
    [devices]
  );

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
        searchPlaceholder="Search hostname, serial, user, OS, IP or MAC…"
        initialQuery={initialQuery}
        filterOf={(d) => d.health}
        filterOptions={healthOptions}
        filterLabel="All status"
        filters={filters}
        loading={loading}
        emptyText="No devices found"
      />
    </>
  );
}
