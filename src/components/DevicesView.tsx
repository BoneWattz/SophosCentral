"use client";

import { useMemo } from "react";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices, type Device } from "@/lib/useDevices";
import { lookupPerson, usePeople } from "@/lib/usePeople";

const DAY = 24 * 60 * 60 * 1000;

// A device plus its owner's email and group from the Sophos directory (loaded after the table appears).
type DeviceRow = Device & {
  email: string | null;
  groups: string[];
  personPending: boolean; // owner known but email/group not loaded yet
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const timestamp = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

const columns: Column<DeviceRow>[] = [
  { header: "Hostname", render: (d) => d.hostname, sort: (d) => d.hostname },
  { header: "Serial number", render: (d) => d.serialNumber ?? "—", sort: (d) => d.serialNumber },
  { header: "Type", render: (d) => d.type, sort: (d) => d.type },
  { header: "OS", render: (d) => d.os, sort: (d) => d.os },
  { header: "User", render: (d) => d.user ?? "—", sort: (d) => d.user },
  {
    header: "Email",
    render: (d) => d.email ?? (d.personPending ? <span className="muted">…</span> : "—"),
    sort: (d) => d.email,
  },
  {
    header: "Group",
    render: (d) =>
      d.groups.length ? (
        d.groups.map((g) => (
          <span key={g} className="badge" style={{ marginRight: 4 }}>
            {g}
          </span>
        ))
      ) : d.personPending ? (
        <span className="muted">…</span>
      ) : (
        "—"
      ),
    sort: (d) => d.groups.join(", "),
  },
  { header: "IP", render: (d) => d.ip ?? "—", sort: (d) => d.ip },
  { header: "MAC", render: (d) => d.mac ?? "—", sort: (d) => d.mac },
  {
    header: "Online",
    render: (d) =>
      d.online === null ? "—" : <span className={`badge ${d.online ? "good" : ""}`}>{d.online ? "Online" : "Offline"}</span>,
    sort: (d) => d.online,
  },
  {
    header: "Tamper",
    render: (d) => (d.tamperProtection === null ? "—" : d.tamperProtection ? "On" : "Off"),
    sort: (d) => d.tamperProtection,
  },
  { header: "Registered", render: (d) => fmtDate(d.registeredAt), sort: (d) => timestamp(d.registeredAt) },
  { header: "Last seen", render: (d) => fmtDate(d.lastSeenAt), sort: (d) => timestamp(d.lastSeenAt) },
  { header: "Status", render: (d) => <span className={`badge ${d.health}`}>{d.health}</span>, sort: (d) => d.health },
];

const searchText = (d: DeviceRow) =>
  [d.hostname, d.serialNumber, d.user, d.email, d.groups.join(" "), d.os, d.ip, d.mac, d.type, d.health]
    .filter(Boolean)
    .join(" ");

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

// What the Excel file contains: the same columns as the table, with real dates and the full group list.
const exportColumns: ExportConfig<DeviceRow>["columns"] = [
  { header: "Hostname", value: (d) => d.hostname, width: 24 },
  { header: "Serial number", value: (d) => d.serialNumber, width: 22 },
  { header: "Type", value: (d) => d.type, width: 10 },
  { header: "OS", value: (d) => d.os, width: 22 },
  { header: "User", value: (d) => d.user, width: 28 },
  { header: "Email", value: (d) => d.email, width: 32 },
  { header: "Group", value: (d) => d.groups.join("; "), width: 26 },
  { header: "IP", value: (d) => d.ip, width: 16 },
  { header: "MAC", value: (d) => d.mac, width: 18 },
  { header: "Online", value: (d) => (d.online === null ? null : d.online ? "Online" : "Offline"), width: 10 },
  { header: "Tamper", value: (d) => (d.tamperProtection === null ? null : d.tamperProtection ? "On" : "Off"), width: 10 },
  { header: "Registered", value: (d) => toDate(d.registeredAt), width: 18 },
  { header: "Last seen", value: (d) => toDate(d.lastSeenAt), width: 18 },
  { header: "Status", value: (d) => d.health, width: 12 },
];

const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

function lastSeenTest(d: DeviceRow, value: string) {
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

  const userIds = useMemo(
    () => Array.from(new Set(devices.map((d) => d.userId).filter((id): id is string => !!id))),
    [devices]
  );
  const people = usePeople(userIds);

  // Re-built each time a batch of emails/groups arrives (people.version changes).
  const rows = useMemo<DeviceRow[]>(
    () =>
      devices.map((d) => {
        const p = lookupPerson(d.userId);
        return { ...d, email: p?.email ?? null, groups: p?.groups ?? [], personPending: !!d.userId && p === undefined };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, people.version]
  );

  const healthOptions = useMemo(() => distinct(rows.map((d) => d.health)), [rows]);

  const filters = useMemo<FilterDef<DeviceRow>[]>(
    () => [
      {
        key: "group",
        label: "Group",
        options: [{ value: "__none", label: "(no group)" }, ...toOptions(distinct(rows.flatMap((d) => d.groups)))],
        test: (d, v) => (v === "__none" ? d.groups.length === 0 && !d.personPending : d.groups.includes(v)),
      },
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
        options: toOptions(distinct(rows.map((d) => d.platform))),
        test: (d, v) => d.platform === v,
      },
      {
        key: "os",
        label: "Operating system",
        options: toOptions(distinct(rows.map((d) => d.os))),
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
    [rows]
  );

  const exportConfig = useMemo<ExportConfig<DeviceRow>>(
    () => ({
      fileName: "sophos-devices",
      columns: exportColumns,
      // Emails and groups arrive after the table; wait so the file isn't missing them.
      disabledReason: people.loading ? "Still loading emails and groups. Export will be ready in a moment." : undefined,
    }),
    [people.loading]
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
      {people.failed > 0 && !people.loading && (
        <p className="error" style={{ marginBottom: 12 }}>
          Couldn&apos;t load the email and group for {people.failed.toLocaleString()} users.{" "}
          <button className="link-btn" onClick={people.retry}>
            Retry
          </button>
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        searchText={searchText}
        searchPlaceholder="Search hostname, serial, user, email, group, OS, IP or MAC…"
        initialQuery={initialQuery}
        filterOf={(d) => d.health}
        filterOptions={healthOptions}
        filterLabel="All status"
        filters={filters}
        exportConfig={exportConfig}
        loading={loading}
        emptyText="No devices found"
      />
    </>
  );
}
