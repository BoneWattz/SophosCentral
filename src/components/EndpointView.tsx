"use client";

import { useMemo } from "react";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import LicenseSummary from "./LicenseSummary";
import { IconCheckCircle, IconMonitor, IconShield, IconUser, IconXCircle } from "./icons";
import { useDevices, type Device } from "@/lib/useDevices";
import { useLicenses } from "@/lib/useLicenses";
import { lookupPerson, usePeople } from "@/lib/usePeople";

// A device plus its owner's email and group from the Sophos directory (loaded after the table appears).
type EndpointRow = Device & {
  email: string | null;
  groups: string[];
  personPending: boolean; // owner known but email/group not loaded yet
};

const installLabel = (status: string | undefined) =>
  status === "installed" ? "Installed" : status === "notInstalled" ? "Not installed" : "Unknown";
const installClass = (status: string | undefined) =>
  status === "installed" ? "good" : status === "notInstalled" ? "bad" : "";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const timestamp = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

const columns: Column<EndpointRow>[] = [
  { header: "Hostname", render: (d) => d.hostname, sort: (d) => d.hostname },
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
  { header: "Intercept X version", render: (d) => d.interceptX?.version ?? "—", sort: (d) => d.interceptX?.version },
  {
    header: "Intercept X",
    render: (d) => (
      <span className={`badge ${installClass(d.interceptX?.status)}`}>{installLabel(d.interceptX?.status)}</span>
    ),
    sort: (d) => installLabel(d.interceptX?.status),
  },
  { header: "Health", render: (d) => <span className={`badge ${d.health}`}>{d.health}</span>, sort: (d) => d.health },
  {
    header: "Online",
    render: (d) =>
      d.online === null ? "—" : <span className={`badge ${d.online ? "good" : ""}`}>{d.online ? "Online" : "Offline"}</span>,
    sort: (d) => d.online,
  },
  { header: "Registered", render: (d) => fmtDate(d.registeredAt), sort: (d) => timestamp(d.registeredAt) },
  { header: "Last seen", render: (d) => fmtDate(d.lastSeenAt), sort: (d) => timestamp(d.lastSeenAt) },
];

const searchText = (d: EndpointRow) =>
  [d.hostname, d.user, d.email, d.groups.join(" "), d.os, d.interceptX?.version, d.serialNumber]
    .filter(Boolean)
    .join(" ");

// What the Excel file contains: the table's columns plus serial number, with real dates.
const exportColumns: ExportConfig<EndpointRow>["columns"] = [
  { header: "Hostname", value: (d) => d.hostname, width: 24 },
  { header: "Serial number", value: (d) => d.serialNumber, width: 22 },
  { header: "OS", value: (d) => d.os, width: 22 },
  { header: "User", value: (d) => d.user, width: 28 },
  { header: "Email", value: (d) => d.email, width: 32 },
  { header: "Group", value: (d) => d.groups.join("; "), width: 26 },
  { header: "Intercept X version", value: (d) => d.interceptX?.version, width: 20 },
  { header: "Intercept X", value: (d) => installLabel(d.interceptX?.status), width: 14 },
  { header: "Health", value: (d) => d.health, width: 12 },
  { header: "Online", value: (d) => (d.online === null ? null : d.online ? "Online" : "Offline"), width: 10 },
  { header: "Registered", value: (d) => toDate(d.registeredAt), width: 18 },
  { header: "Last seen", value: (d) => toDate(d.lastSeenAt), width: 18 },
];

const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

export default function EndpointView() {
  const devicesState = useDevices();
  const licensesState = useLicenses();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);
  const license = licensesState.licenses.find((l) => l.code === "CIXA-MSP");

  const userIds = useMemo(
    () => Array.from(new Set(devices.map((d) => d.userId).filter((id): id is string => !!id))),
    [devices]
  );
  const people = usePeople(userIds);

  // Re-built each time a batch of emails/groups arrives (people.version changes).
  const rows = useMemo<EndpointRow[]>(
    () =>
      devices.map((d) => {
        const p = lookupPerson(d.userId);
        return { ...d, email: p?.email ?? null, groups: p?.groups ?? [], personPending: !!d.userId && p === undefined };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, people.version]
  );

  const installed = devices.filter((d) => d.interceptX?.status === "installed").length;
  const notInstalled = devices.filter((d) => d.interceptX?.status !== "installed").length;
  const distinctUsers = new Set(
    devices.filter((d) => d.interceptX?.status === "installed" && d.userId).map((d) => d.userId)
  ).size;

  const filters = useMemo<FilterDef<EndpointRow>[]>(
    () => [
      {
        key: "install",
        label: "Intercept X status",
        options: [
          { value: "installed", label: "Installed" },
          { value: "notInstalled", label: "Not installed / unknown" },
        ],
        test: (d, v) => (v === "installed") === (d.interceptX?.status === "installed"),
      },
      {
        key: "group",
        label: "Group",
        options: [{ value: "__none", label: "(no group)" }, ...toOptions(distinct(rows.flatMap((d) => d.groups)))],
        test: (d, v) => (v === "__none" ? d.groups.length === 0 && !d.personPending : d.groups.includes(v)),
      },
      {
        key: "version",
        label: "Version",
        options: toOptions(distinct(rows.map((d) => d.interceptX?.version ?? "")).filter(Boolean)),
        test: (d, v) => d.interceptX?.version === v,
      },
      {
        key: "platform",
        label: "Platform",
        options: toOptions(distinct(rows.map((d) => d.platform))),
        test: (d, v) => d.platform === v,
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
        key: "registered",
        label: "Registered",
        options: [
          { value: "7d", label: "Within 7 days" },
          { value: "30d", label: "Within 30 days" },
          { value: "90d", label: "Within 90 days" },
          { value: "older", label: "Older than 90 days" },
        ],
        test: (d, v) => {
          if (!d.registeredAt) return false;
          const days = (Date.now() - new Date(d.registeredAt).getTime()) / 86_400_000;
          return v === "older" ? days > 90 : days <= Number.parseInt(v, 10);
        },
      },
    ],
    [rows]
  );

  const exportConfig = useMemo<ExportConfig<EndpointRow>>(
    () => ({
      fileName: "sophos-endpoint",
      columns: exportColumns,
      // Emails and groups arrive after the table; wait so the file isn't missing them.
      disabledReason: people.loading ? "Still loading emails and groups. Export will be ready in a moment." : undefined,
    }),
    [people.loading]
  );

  const loading = devicesState.loading || licensesState.loading;
  const error = devicesState.error ?? licensesState.error;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sophos Endpoint</h1>
          <p className="muted">Intercept X Advanced licences and protected devices</p>
        </div>
        <div className="actions">
          <button
            className="btn"
            disabled={loading}
            onClick={() => {
              devicesState.reload();
              licensesState.reload();
            }}
          >
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

      <LicenseSummary
        title="Sophos Endpoint (Intercept X Advanced)"
        icon={<IconShield size={18} />}
        unit="user" // Product name is "Sophos Endpoint - User MSP Monthly"
        license={license}
        loading={licensesState.loading}
        stats={[
          { label: "Devices with Intercept X", value: installed, icon: <IconCheckCircle size={16} />, tone: "ok" },
          { label: "Not installed / unknown", value: notInstalled, icon: <IconXCircle size={16} />, tone: "bad" },
          { label: "Distinct users", value: distinctUsers, icon: <IconUser size={16} />, tone: "neutral" },
          { label: "Total devices", value: devices.length, icon: <IconMonitor size={16} />, tone: "neutral" },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        searchText={searchText}
        searchPlaceholder="Search hostname, user, email, group, OS or version…"
        filters={filters}
        exportConfig={exportConfig}
        loading={devicesState.loading}
        emptyText="No devices found"
      />
    </>
  );
}
