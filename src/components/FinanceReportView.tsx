"use client";

import { useMemo } from "react";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices } from "@/lib/useDevices";
import { lookupPerson, usePeople } from "@/lib/usePeople";
import { useItEmployees } from "@/lib/useItEmployees";
import { firstValue, groupByPerson, lowerEmail, ownerIndex } from "@/lib/itMonitoring";

// One line of the report per employee; all of their Sophos devices are listed in one cell.
interface ReportRow {
  key: string;
  idNumber: number | null;
  fullName: string | null;
  email: string | null; // MS 365 Email from GT - IT Monitoring
  clientName: string | null;
  devices: string[]; // Sophos hostnames, A-Z (empty = no device found)
}

const dash = (v: string | number | null) => (v === null || v === "" ? "—" : v);
const distinct = (values: (string | null)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const columns: Column<ReportRow>[] = [
  { header: "ID Number", render: (r) => dash(r.idNumber), sort: (r) => r.idNumber },
  { header: "Full Name", render: (r) => dash(r.fullName), sort: (r) => r.fullName },
  { header: "Email", render: (r) => dash(r.email), sort: (r) => r.email },
  { header: "Department / Client Name", render: (r) => dash(r.clientName), sort: (r) => r.clientName },
  {
    header: "Device",
    render: (r) =>
      r.devices.length ? (
        <div className="cell-list">
          {r.devices.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      ) : (
        <span className="muted">No device found</span>
      ),
    sort: (r) => r.devices[0],
  },
];

const searchText = (r: ReportRow) => [r.idNumber, r.fullName, r.email, r.clientName, r.devices.join(" ")].filter((v) => v !== null).join(" ");

const exportConfig: ExportConfig<ReportRow> = {
  fileName: "finance-report",
  columns: [
    { header: "ID Number", value: (r) => r.idNumber, width: 12 },
    { header: "Full Name", value: (r) => r.fullName, width: 32 },
    { header: "Email", value: (r) => r.email, width: 34 },
    { header: "Department / Client Name", value: (r) => r.clientName, width: 34 },
    { header: "Device", value: (r) => (r.devices.length ? r.devices.join("; ") : "No device found"), width: 40 },
    { header: "No. of devices", value: (r) => r.devices.length, width: 14 },
  ],
};

export default function FinanceReportView() {
  const devicesState = useDevices();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);

  const { employees, loading: empLoading, error: empError, reload: loadEmployees } = useItEmployees();

  // Devices carry the Sophos user id; the email comes from the directory lookup (as on the Sophos Endpoint page).
  const userIds = useMemo(
    () => Array.from(new Set(devices.map((d) => d.userId).filter((id): id is string => !!id))),
    [devices]
  );
  const people = usePeople(userIds);

  const rows = useMemo<ReportRow[]>(() => {
    // Records of the same person (same MS 365 email) are combined so the report shows one row per person.
    const group = groupByPerson(employees);
    const owner = ownerIndex(group);

    const byPerson = new Map<number, string[]>();
    for (const d of devices) {
      const email = lowerEmail(lookupPerson(d.userId)?.email);
      const i = email ? owner.get(email) : undefined;
      if (i === undefined) continue;
      const list = byPerson.get(i) ?? [];
      list.push(d.hostname);
      byPerson.set(i, list);
    }

    return group.map((g, i) => ({
      key: String(g[0].id),
      idNumber: firstValue(g, "idNumber"),
      fullName: firstValue(g, "completeName"),
      email: firstValue(g, "ms365Email"),
      clientName: firstValue(g, "clientName"),
      devices: (byPerson.get(i) ?? []).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, devices, people.version]);

  const filters = useMemo<FilterDef<ReportRow>[]>(
    () => [
      {
        key: "devices",
        label: "Devices per employee",
        options: [
          { value: "none", label: "No device found" },
          { value: "one", label: "One device" },
          { value: "many", label: "Multiple devices" },
        ],
        test: (r, v) => (v === "none" ? r.devices.length === 0 : v === "one" ? r.devices.length === 1 : r.devices.length > 1),
      },
      {
        key: "client",
        label: "Department / Client",
        options: distinct(employees.map((e) => e.clientName)).map((v) => ({ value: v, label: v })),
        test: (r, v) => r.clientName === v,
      },
    ],
    [employees]
  );

  const emailsReady = !devicesState.loading && !people.loading;
  const loading = devicesState.loading || empLoading || people.loading;
  const error = devicesState.error ?? empError;

  const employeeCount = rows.length;
  const withDevices = rows.filter((r) => r.devices.length > 0).length;
  const multi = rows.filter((r) => r.devices.length > 1).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Finance</h1>
          <p className="muted">
            {emailsReady && !empLoading
              ? `${employeeCount.toLocaleString()} employees · ${withDevices.toLocaleString()} with a device · ${multi.toLocaleString()} with multiple devices`
              : "Matching employees to Sophos devices…"}
          </p>
        </div>
        <div className="actions">
          <button
            className="btn"
            disabled={loading}
            onClick={() => {
              devicesState.reload();
              loadEmployees();
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {people.failed > 0 && !people.loading && (
        <p className="error" style={{ marginBottom: 12 }}>
          Couldn&apos;t load the email for {people.failed.toLocaleString()} Sophos users, so some devices may show as &quot;No device found&quot;.{" "}
          <button className="link-btn" onClick={people.retry}>
            Retry
          </button>
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        searchText={searchText}
        searchPlaceholder="Search ID, name, email, client or device…"
        filters={filters}
        exportConfig={{
          ...exportConfig,
          disabledReason: emailsReady && !empLoading ? undefined : "Still matching devices. Export will be ready in a moment.",
        }}
        columnToggle
        loading={loading}
        emptyText="No records found"
      />
    </>
  );
}
