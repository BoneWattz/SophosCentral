"use client";

import { useMemo } from "react";
import DataTable, { type Column, type FilterDef } from "./DataTable";
import LicenseSummary from "./LicenseSummary";
import { useDevices, type Device } from "@/lib/useDevices";
import { useLicenses } from "@/lib/useLicenses";

const installLabel = (status: string | undefined) =>
  status === "installed" ? "Installed" : status === "notInstalled" ? "Not installed" : "Unknown";
const installClass = (status: string | undefined) =>
  status === "installed" ? "good" : status === "notInstalled" ? "bad" : "";

const columns: Column<Device>[] = [
  { header: "Hostname", render: (d) => d.hostname },
  { header: "OS", render: (d) => d.os },
  { header: "User", render: (d) => d.user ?? "—" },
  { header: "Intercept X version", render: (d) => d.interceptX?.version ?? "—" },
  {
    header: "Intercept X",
    render: (d) => (
      <span className={`badge ${installClass(d.interceptX?.status)}`}>{installLabel(d.interceptX?.status)}</span>
    ),
  },
  { header: "Health", render: (d) => <span className={`badge ${d.health}`}>{d.health}</span> },
  {
    header: "Online",
    render: (d) =>
      d.online === null ? "—" : <span className={`badge ${d.online ? "good" : ""}`}>{d.online ? "Online" : "Offline"}</span>,
  },
  { header: "Last seen", render: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—") },
];

const searchText = (d: Device) =>
  [d.hostname, d.user, d.os, d.interceptX?.version, d.serialNumber].filter(Boolean).join(" ");

const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

export default function EndpointView() {
  const devicesState = useDevices();
  const licensesState = useLicenses();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);
  const license = licensesState.licenses.find((l) => l.code === "CIXA-MSP");

  const installed = devices.filter((d) => d.interceptX?.status === "installed").length;
  const notInstalled = devices.filter((d) => d.interceptX?.status !== "installed").length;

  const filters = useMemo<FilterDef<Device>[]>(
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
        key: "version",
        label: "Version",
        options: distinct(devices.map((d) => d.interceptX?.version ?? "")).filter(Boolean).map((v) => ({ value: v, label: v })),
        test: (d, v) => d.interceptX?.version === v,
      },
      {
        key: "platform",
        label: "Platform",
        options: distinct(devices.map((d) => d.platform)).map((v) => ({ value: v, label: v })),
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
    ],
    [devices]
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

      <LicenseSummary
        title="Sophos Endpoint (Intercept X Advanced)"
        license={license}
        loading={licensesState.loading}
        stats={[
          { label: "Devices with Intercept X", value: installed },
          { label: "Not installed / unknown", value: notInstalled },
          { label: "Total devices", value: devices.length },
        ]}
      />

      <DataTable
        columns={columns}
        rows={devices}
        rowKey={(d) => d.id}
        searchText={searchText}
        searchPlaceholder="Search hostname, user, OS or version…"
        filters={filters}
        loading={devicesState.loading}
        emptyText="No devices found"
      />
    </>
  );
}
