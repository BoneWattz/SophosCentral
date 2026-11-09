"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices } from "@/lib/useDevices";
import { lookupPerson, usePeople } from "@/lib/usePeople";
import type { ItRow } from "@/lib/itMonitoring";

// One line of the report: one device of one employee. An employee with several devices
// gets several lines; the first line of each employee starts a new group.
interface ReportRow {
  key: string;
  idNumber: number | null;
  fullName: string | null;
  email: string | null; // MS 365 Email from GT - IT Monitoring
  clientName: string | null;
  device: string | null; // Sophos hostname; null = no device found
  deviceIndex: number; // 0 for the first device of an employee
  deviceCount: number;
}

const dash = (v: string | number | null) => (v === null || v === "" ? "—" : v);
const lower = (v: string | null | undefined) => v?.trim().toLowerCase() || null;
const distinct = (values: (string | null)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// On follow-up devices the employee columns repeat in grey (see globals.css), so a page break or a sort never leaves blank cells.
const columns: Column<ReportRow>[] = [
  { header: "ID Number", render: (r) => dash(r.idNumber), sort: (r) => r.idNumber },
  { header: "Full Name", render: (r) => dash(r.fullName), sort: (r) => r.fullName },
  { header: "Email", render: (r) => dash(r.email), sort: (r) => r.email },
  { header: "Department / Client Name", render: (r) => dash(r.clientName), sort: (r) => r.clientName },
  {
    header: "Device",
    render: (r) => (r.device ? r.device : <span className="muted">No device found</span>),
  },
];

const searchText = (r: ReportRow) => [r.idNumber, r.fullName, r.email, r.clientName, r.device].filter((v) => v !== null).join(" ");

const exportConfig: ExportConfig<ReportRow> = {
  fileName: "finance-report",
  columns: [
    { header: "ID Number", value: (r) => r.idNumber, width: 12 },
    { header: "Full Name", value: (r) => r.fullName, width: 32 },
    { header: "Email", value: (r) => r.email, width: 34 },
    { header: "Department / Client Name", value: (r) => r.clientName, width: 34 },
    { header: "Device", value: (r) => r.device ?? "No device found", width: 26 },
    { header: "Devices", value: (r) => r.deviceCount, width: 10 },
  ],
};

export default function FinanceReportView() {
  const router = useRouter();
  const devicesState = useDevices();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);

  const [employees, setEmployees] = useState<ItRow[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    try {
      const res = await fetch("/api/it-monitoring", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
      if (!res.ok) {
        setEmpError(body.error ?? "Failed to load GT - IT Monitoring");
        return;
      }
      setEmpError(null);
      setEmployees(body.rows);
    } catch {
      setEmpError("Could not reach the server. Check your connection and try again.");
    } finally {
      setEmpLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Devices carry the Sophos user id; the email comes from the directory lookup (as on the Sophos Endpoint page).
  const userIds = useMemo(
    () => Array.from(new Set(devices.map((d) => d.userId).filter((id): id is string => !!id))),
    [devices]
  );
  const people = usePeople(userIds);

  const rows = useMemo<ReportRow[]>(() => {
    // email -> first employee that owns it (MS 365 email first, then Sophos email). The sheet repeats a few
    // emails; the first record wins so a device is never listed twice.
    const owner = new Map<string, number>();
    employees.forEach((e, i) => {
      const m = lower(e.ms365Email);
      if (m && !owner.has(m)) owner.set(m, i);
    });
    employees.forEach((e, i) => {
      const s = lower(e.sophosEmail);
      if (s && !owner.has(s)) owner.set(s, i);
    });

    const byEmployee = new Map<number, string[]>();
    for (const d of devices) {
      const email = lower(lookupPerson(d.userId)?.email);
      const i = email ? owner.get(email) : undefined;
      if (i === undefined) continue;
      const list = byEmployee.get(i) ?? [];
      list.push(d.hostname);
      byEmployee.set(i, list);
    }

    // Employees in the same order as the table (newest first), devices A-Z within each employee.
    const out: ReportRow[] = [];
    employees.forEach((e, i) => {
      const hosts = (byEmployee.get(i) ?? []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const list: (string | null)[] = hosts.length ? hosts : [null];
      list.forEach((device, n) =>
        out.push({
          key: `${e.id}-${n}`,
          idNumber: e.idNumber,
          fullName: e.completeName,
          email: e.ms365Email,
          clientName: e.clientName,
          device,
          deviceIndex: n,
          deviceCount: hosts.length,
        })
      );
    });
    return out;
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
        test: (r, v) => (v === "none" ? r.deviceCount === 0 : v === "one" ? r.deviceCount === 1 : r.deviceCount > 1),
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

  const employeeCount = employees.length;
  const withDevices = new Set(rows.filter((r) => r.device).map((r) => r.key.split("-")[0])).size;
  const multi = new Set(rows.filter((r) => r.deviceCount > 1).map((r) => r.key.split("-")[0])).size;

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
        rowClass={(r) => (r.deviceIndex === 0 ? "group-start" : "group-cont")}
        loading={loading}
        emptyText="No records found"
      />
    </>
  );
}
