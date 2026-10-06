"use client";

import { useMemo } from "react";
import DataTable, { type Column, type FilterDef } from "./DataTable";
import LicenseSummary from "./LicenseSummary";
import { IconAlert, IconCheckCircle, IconLock, IconUser, IconXCircle } from "./icons";
import { useDevices, type Device } from "@/lib/useDevices";
import { useLicenses } from "@/lib/useLicenses";

const STATE_LABEL: Record<string, string> = {
  encrypted: "Encrypted",
  partial: "Partially encrypted",
  notEncrypted: "Not encrypted",
  encrypting: "Encrypting",
  suspended: "Suspended",
  notSupported: "Not supported",
  unknown: "Unknown",
};
const STATE_CLASS: Record<string, string> = {
  encrypted: "good",
  notEncrypted: "bad",
  partial: "suspicious",
  encrypting: "suspicious",
  suspended: "suspicious",
};

const stateLabel = (s: string) => STATE_LABEL[s] ?? s;

const columns: Column<Device>[] = [
  { header: "Hostname", render: (d) => d.hostname },
  { header: "Serial number", render: (d) => d.serialNumber ?? "—" },
  { header: "OS", render: (d) => d.os },
  { header: "User", render: (d) => d.user ?? "—" },
  { header: "Volumes", render: (d) => d.encryption.volumes },
  {
    header: "Encryption",
    render: (d) => <span className={`badge ${STATE_CLASS[d.encryption.state] ?? ""}`}>{stateLabel(d.encryption.state)}</span>,
  },
  {
    header: "Component",
    render: (d) =>
      d.encryption.component === "installed" ? "Installed" : d.encryption.component === "notInstalled" ? "Not installed" : "—",
  },
  { header: "Last seen", render: (d) => (d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—") },
];

const searchText = (d: Device) =>
  [d.hostname, d.serialNumber, d.user, d.os, stateLabel(d.encryption.state)].filter(Boolean).join(" ");

export default function EncryptionView() {
  const devicesState = useDevices();
  const licensesState = useLicenses();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);
  const license = licensesState.licenses.find((l) => l.code === "CDE-MSP");

  const count = (state: string) => devices.filter((d) => d.encryption.state === state).length;
  const encryptedUsers = new Set(
    devices
      .filter((d) => ["encrypted", "partial", "encrypting", "suspended"].includes(d.encryption.state) && d.userId)
      .map((d) => d.userId)
  ).size;

  const filters = useMemo<FilterDef<Device>[]>(
    () => [
      {
        key: "state",
        label: "Encryption status",
        options: Object.entries(STATE_LABEL).map(([value, label]) => ({ value, label })),
        test: (d, v) => d.encryption.state === v,
      },
      {
        key: "component",
        label: "Encryption component",
        options: [
          { value: "installed", label: "Installed" },
          { value: "notInstalled", label: "Not installed" },
        ],
        test: (d, v) => d.encryption.component === v,
      },
      {
        key: "platform",
        label: "Platform",
        options: Array.from(new Set(devices.map((d) => d.platform)))
          .sort()
          .map((v) => ({ value: v, label: v })),
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
          <h1>Central Device Encryption</h1>
          <p className="muted">Disk encryption licences and device status</p>
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
        title="Central Device Encryption"
        icon={<IconLock size={18} />}
        // Sophos doesn't label this product's billing unit; the licence count (1,100) sits much closer to
        // distinct users (~1,250) than to devices (~1,470), so it is shown as per user. Change here if Sophos says otherwise.
        unit="user"
        license={license}
        loading={licensesState.loading}
        stats={[
          { label: "Fully encrypted", value: count("encrypted"), icon: <IconCheckCircle size={16} />, tone: "ok" },
          { label: "Not encrypted", value: count("notEncrypted"), icon: <IconXCircle size={16} />, tone: "bad" },
          {
            label: "Partial / suspended / encrypting",
            value: count("partial") + count("suspended") + count("encrypting"),
            icon: <IconAlert size={16} />,
            tone: "warn",
          },
          { label: "Distinct users encrypted", value: encryptedUsers, icon: <IconUser size={16} />, tone: "neutral" },
        ]}
      />

      <DataTable
        columns={columns}
        rows={devices}
        rowKey={(d) => d.id}
        searchText={searchText}
        searchPlaceholder="Search hostname, serial, user or status…"
        filters={filters}
        loading={devicesState.loading}
        emptyText="No devices found"
      />
    </>
  );
}
