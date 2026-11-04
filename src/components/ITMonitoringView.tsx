"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { IconEdit, IconTrash } from "./icons";
import { formatLongDate } from "@/lib/hc";
import { HC_STATUS_OPTIONS, STATUS_OPTIONS, type ItInput, type ItRow } from "@/lib/itMonitoring";

// Parses a JSON reply; if the server sent something else (e.g. a hosting error page),
// returns a readable message that includes the HTTP status.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { error: `Server error (HTTP ${res.status}). Check the Netlify function logs.` };
  }
}

const distinct = (values: (string | null)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));
const dash = (v: string | number | null) => (v === null || v === "" ? "—" : v);
const toDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

const statusClass = (s: string | null) => (s === "Active" ? "good" : s === "Deleted" || s === "Resigned" ? "bad" : s ? "warn" : "");

const columns: Column<ItRow>[] = [
  { header: "ID Number", render: (r) => dash(r.idNumber), sort: (r) => r.idNumber },
  { header: "MS 365 Email", render: (r) => dash(r.ms365Email), sort: (r) => r.ms365Email },
  { header: "Sophos Email", render: (r) => dash(r.sophosEmail), sort: (r) => r.sophosEmail },
  { header: "Family Name", render: (r) => dash(r.familyName), sort: (r) => r.familyName },
  { header: "First Name", render: (r) => dash(r.firstName), sort: (r) => r.firstName },
  { header: "Middle Name", render: (r) => dash(r.middleName), sort: (r) => r.middleName },
  { header: "Complete Name", render: (r) => dash(r.completeName), sort: (r) => r.completeName },
  { header: "Department / Client name", render: (r) => dash(r.clientName), sort: (r) => r.clientName },
  { header: "Division", render: (r) => dash(r.division), sort: (r) => r.division },
  { header: "Cost Center", render: (r) => dash(r.costCenter), sort: (r) => r.costCenter },
  { header: "Position", render: (r) => dash(r.position), sort: (r) => r.position },
  {
    header: "Status",
    render: (r) => (r.status ? <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> : "—"),
    sort: (r) => r.status,
  },
  { header: "Remarks", render: (r) => dash(r.remarks), sort: (r) => r.remarks },
  {
    header: "Heartcount Status",
    render: (r) => (r.hcStatus ? <span className={`badge ${statusClass(r.hcStatus)}`}>{r.hcStatus}</span> : "—"),
    sort: (r) => r.hcStatus,
  },
  { header: "Date License Removal", render: (r) => formatLongDate(r.dateLicenseRemoval), sort: (r) => r.dateLicenseRemoval },
];

const searchText = (r: ItRow) =>
  [r.idNumber, r.ms365Email, r.sophosEmail, r.completeName, r.clientName, r.division, r.costCenter, r.position, r.status, r.remarks, r.hcStatus]
    .filter((v) => v !== null && v !== undefined)
    .join(" ");

// The Excel file has the same columns as the sheet, with a real date in the last one.
const exportConfig: ExportConfig<ItRow> = {
  fileName: "gt-it-monitoring",
  columns: [
    { header: "ID Number", value: (r) => r.idNumber, width: 12 },
    { header: "MS 365 Email", value: (r) => r.ms365Email, width: 32 },
    { header: "Sophos Email", value: (r) => r.sophosEmail, width: 32 },
    { header: "Family Name", value: (r) => r.familyName, width: 20 },
    { header: "First Name", value: (r) => r.firstName, width: 22 },
    { header: "Middle Name", value: (r) => r.middleName, width: 18 },
    { header: "Complete Name", value: (r) => r.completeName, width: 30 },
    { header: "Department / Client name", value: (r) => r.clientName, width: 34 },
    { header: "Division", value: (r) => r.division, width: 18 },
    { header: "Cost Center", value: (r) => r.costCenter, width: 30 },
    { header: "Position", value: (r) => r.position, width: 30 },
    { header: "Status", value: (r) => r.status, width: 12 },
    { header: "Remarks", value: (r) => r.remarks, width: 40 },
    { header: "Heartcount Status", value: (r) => r.hcStatus, width: 18 },
    { header: "Date License Removal", value: (r) => toDate(r.dateLicenseRemoval), width: 20 },
  ],
};

const EMPTY: ItInput = {
  idNumber: "",
  ms365Email: "",
  sophosEmail: "",
  familyName: "",
  firstName: "",
  middleName: "",
  completeName: "",
  clientName: "",
  division: "",
  costCenter: "",
  position: "",
  status: "",
  remarks: "",
  hcStatus: "",
  dateLicenseRemoval: "",
};

const toInput = (r: ItRow): ItInput => ({
  idNumber: r.idNumber === null ? "" : String(r.idNumber),
  ms365Email: r.ms365Email ?? "",
  sophosEmail: r.sophosEmail ?? "",
  familyName: r.familyName ?? "",
  firstName: r.firstName ?? "",
  middleName: r.middleName ?? "",
  completeName: r.completeName ?? "",
  clientName: r.clientName ?? "",
  division: r.division ?? "",
  costCenter: r.costCenter ?? "",
  position: r.position ?? "",
  status: r.status ?? "",
  remarks: r.remarks ?? "",
  hcStatus: r.hcStatus ?? "",
  dateLicenseRemoval: r.dateLicenseRemoval ?? "",
});

export default function ITMonitoringView() {
  const router = useRouter();
  const [rows, setRows] = useState<ItRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // null = closed, "new" = adding, a row = editing it
  const [editing, setEditing] = useState<ItRow | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-monitoring", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to load records");
        return;
      }
      setError(null);
      setRows(body.rows);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(async (r: ItRow) => {
    const who = r.completeName ?? r.ms365Email ?? `ID ${r.idNumber ?? r.id}`;
    if (!confirm(`Delete ${who}?\n\nThis permanently removes the record.`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/it-monitoring?id=${r.id}`, { method: "DELETE" });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body.error ?? "Failed to delete record");
      return;
    }
    setRows((all) => all.filter((x) => x.id !== r.id));
    setMessage(`Deleted ${who}`);
  }, []);

  const filters = useMemo<FilterDef<ItRow>[]>(
    () => [
      {
        key: "status",
        label: "Status",
        options: [{ value: "__blank", label: "(blank)" }, ...toOptions(distinct(rows.map((r) => r.status)))],
        test: (r, v) => (v === "__blank" ? !r.status : r.status === v),
      },
      {
        key: "hcStatus",
        label: "Heartcount Status",
        options: [{ value: "__blank", label: "(blank)" }, ...toOptions(distinct(rows.map((r) => r.hcStatus)))],
        test: (r, v) => (v === "__blank" ? !r.hcStatus : r.hcStatus === v),
      },
      {
        key: "client",
        label: "Department / Client",
        options: toOptions(distinct(rows.map((r) => r.clientName))),
        test: (r, v) => r.clientName === v,
      },
      {
        key: "division",
        label: "Division",
        options: toOptions(distinct(rows.map((r) => r.division))),
        test: (r, v) => r.division === v,
      },
      {
        key: "costCenter",
        label: "Cost Center",
        options: toOptions(distinct(rows.map((r) => r.costCenter))),
        test: (r, v) => r.costCenter === v,
      },
      {
        key: "removal",
        label: "License removal",
        options: [
          { value: "set", label: "Has a removal date" },
          { value: "none", label: "No removal date" },
        ],
        test: (r, v) => (v === "set") === !!r.dateLicenseRemoval,
      },
    ],
    [rows]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>GT - IT Monitoring</h1>
          <p className="muted">{rows.length.toLocaleString()} records · newest first</p>
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn" onClick={() => setEditing("new")}>
            + Add record
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {message && <p className="success" style={{ marginBottom: 12 }}>{message}</p>}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        searchText={searchText}
        searchPlaceholder="Search name, email, ID number, client, position or remarks…"
        filters={filters}
        exportConfig={exportConfig}
        loading={loading}
        emptyText="No records found"
        actions={(r) => (
          <>
            <button className="icon-btn" onClick={() => setEditing(r)} aria-label="Edit record" title="Edit">
              <IconEdit size={16} />
            </button>
            <button className="icon-btn danger" onClick={() => remove(r)} aria-label="Delete record" title="Delete">
              <IconTrash size={16} />
            </button>
          </>
        )}
      />

      {editing && (
        <RecordModal
          row={editing === "new" ? null : editing}
          rows={rows}
          onClose={() => setEditing(null)}
          onSaved={(row, wasNew) => {
            setEditing(null);
            setError(null);
            setMessage(`${wasNew ? "Added" : "Updated"} ${row.completeName ?? "record"}`);
            setRows((all) => (wasNew ? [row, ...all] : all.map((x) => (x.id === row.id ? row : x))));
          }}
        />
      )}
    </>
  );
}

function RecordModal({
  row,
  rows,
  onClose,
  onSaved,
}: {
  row: ItRow | null; // null = add
  rows: ItRow[];
  onClose: () => void;
  onSaved: (row: ItRow, wasNew: boolean) => void;
}) {
  const [f, setF] = useState<ItInput>(row ? toInput(row) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ItInput) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(row ? `/api/it-monitoring?id=${row.id}` : "/api/it-monitoring", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to save record");
        return;
      }
      onSaved(body.row, !row);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="card modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{row ? "Edit record" : "Add record"}</h2>
        <p className="muted">Leave Complete Name empty to build it from the first, middle and family names.</p>

        <div className="form-grid">
          <label>
            ID Number
            <input inputMode="numeric" pattern="[0-9]*" value={f.idNumber} onChange={set("idNumber")} />
          </label>
          <label>
            Complete Name
            <input value={f.completeName} onChange={set("completeName")} />
          </label>
          <label>
            MS 365 Email
            <input type="email" value={f.ms365Email} onChange={set("ms365Email")} />
          </label>
          <label>
            Sophos Email
            <input type="email" value={f.sophosEmail} onChange={set("sophosEmail")} />
          </label>
          <label>
            Family Name
            <input value={f.familyName} onChange={set("familyName")} />
          </label>
          <label>
            First Name
            <input value={f.firstName} onChange={set("firstName")} />
          </label>
          <label>
            Middle Name
            <input value={f.middleName} onChange={set("middleName")} />
          </label>
          <label>
            Department / Client name
            <input list="it-clients" value={f.clientName} onChange={set("clientName")} />
          </label>
          <label>
            Division
            <input list="it-divisions" value={f.division} onChange={set("division")} />
          </label>
          <label>
            Cost Center
            <input list="it-costcenters" value={f.costCenter} onChange={set("costCenter")} />
          </label>
          <label className="span-2">
            Position
            <input value={f.position} onChange={set("position")} />
          </label>
          <label>
            Status
            <select value={f.status} onChange={set("status")}>
              <option value="">(blank)</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label>
            Heartcount Status
            <select value={f.hcStatus} onChange={set("hcStatus")}>
              <option value="">(blank)</option>
              {HC_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date License Removal
            <input type="date" value={f.dateLicenseRemoval} onChange={set("dateLicenseRemoval")} />
          </label>
          <label>
            Remarks
            <input value={f.remarks} onChange={set("remarks")} />
          </label>
        </div>

        <datalist id="it-clients">
          {distinct(rows.map((r) => r.clientName)).map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="it-divisions">
          {distinct(rows.map((r) => r.division)).map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="it-costcenters">
          {distinct(rows.map((r) => r.costCenter)).map((v) => <option key={v} value={v} />)}
        </datalist>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : row ? "Save changes" : "Add record"}
          </button>
        </div>
      </form>
    </div>
  );
}
