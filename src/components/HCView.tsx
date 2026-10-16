"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type Column, type FilterDef } from "./DataTable";
import { IconTrash } from "./icons";
import { formatLongDate, type HcRow } from "@/lib/hc";

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

const columns = (onDelete: (r: HcRow) => void): Column<HcRow>[] => [
  { header: "No.", render: (r) => r.no, sort: (r) => r.no },
  { header: "ID Number", render: (r) => r.idNumber ?? "—", sort: (r) => r.idNumber },
  {
    header: "Complete Name",
    render: (r) => (
      <>
        {r.completeName}
        {r.dateDeleted && <span className="badge bad" style={{ marginLeft: 8 }}>Deleted</span>}
      </>
    ),
    sort: (r) => r.completeName,
  },
  { header: "Email", render: (r) => r.email, sort: (r) => r.email },
  { header: "Client ID", render: (r) => r.clientId ?? "—", sort: (r) => r.clientId },
  { header: "Department / Client name", render: (r) => r.clientName ?? "—", sort: (r) => r.clientName },
  { header: "Division", render: (r) => r.division ?? "—", sort: (r) => r.division },
  { header: "Cost Center", render: (r) => r.costCenter ?? "—", sort: (r) => r.costCenter },
  { header: "Position", render: (r) => r.position ?? "—", sort: (r) => r.position },
  { header: "Status", render: (r) => r.status ?? "—", sort: (r) => r.status },
  { header: "Remarks", render: (r) => r.remarks ?? "—", sort: (r) => r.remarks },
  { header: "Date Created", render: (r) => formatLongDate(r.dateCreated), sort: (r) => r.dateCreated },
  { header: "Added by", render: (r) => r.addedBy, sort: (r) => r.addedBy },
  { header: "Date Deleted", render: (r) => formatLongDate(r.dateDeleted), sort: (r) => r.dateDeleted },
  { header: "Deleted by", render: (r) => r.deletedBy ?? "—", sort: (r) => r.deletedBy },
];

const searchText = (r: HcRow) =>
  [r.idNumber, r.completeName, r.email, r.clientName, r.clientId, r.position, r.division, r.costCenter, r.status, r.remarks]
    .filter((v) => v !== null && v !== undefined)
    .join(" ");

export default function HCView() {
  const router = useRouter();
  const [rows, setRows] = useState<HcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hc", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to load HC records");
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

  const remove = useCallback(async (r: HcRow) => {
    if (!confirm(`Delete ${r.completeName} (No. ${r.no})?\n\nThe record is kept and marked as deleted, with the date and your name.`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/hc?no=${r.no}`, { method: "DELETE" });
    const body = await readJson(res);
    if (!res.ok) {
      setError(body.error ?? "Failed to delete record");
      return;
    }
    setRows((all) => all.map((x) => (x.no === r.no ? body.row : x)));
    setMessage(`Deleted ${r.completeName}`);
  }, []);

  const cols = useMemo(() => columns(remove), [remove]);

  const filters = useMemo<FilterDef<HcRow>[]>(
    () => [
      {
        key: "record",
        label: "Record",
        options: [
          { value: "current", label: "Current (not deleted)" },
          { value: "deleted", label: "Deleted" },
        ],
        test: (r, v) => (v === "deleted") === !!r.dateDeleted,
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
        key: "status",
        label: "Status",
        options: [{ value: "__blank", label: "(blank)" }, ...toOptions(distinct(rows.map((r) => r.status)))],
        test: (r, v) => (v === "__blank" ? !r.status : r.status === v),
      },
      {
        key: "addedBy",
        label: "Added by",
        options: toOptions(distinct(rows.map((r) => r.addedBy))),
        test: (r, v) => r.addedBy === v,
      },
      {
        key: "deletedBy",
        label: "Deleted by",
        options: toOptions(distinct(rows.map((r) => r.deletedBy))),
        test: (r, v) => r.deletedBy === v,
      },
    ],
    [rows]
  );

  const deletedCount = rows.filter((r) => r.dateDeleted).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>HC</h1>
          <p className="muted">
            {rows.length.toLocaleString()} records{deletedCount ? ` · ${deletedCount} deleted` : ""}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setOpen(true)}>
            + Add HC
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {message && <p className="success" style={{ marginBottom: 12 }}>{message}</p>}

      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => String(r.no)}
        searchText={searchText}
        searchPlaceholder="Search name, email, ID number, client or position…"
        filters={filters}
        loading={loading}
        emptyText="No records found"
        actions={(r) =>
          r.dateDeleted ? null : (
            <button className="icon-btn danger" onClick={() => remove(r)} aria-label={`Delete ${r.completeName}`} title="Delete">
              <IconTrash size={16} />
            </button>
          )
        }
      />

      {open && (
        <AddHcModal
          rows={rows}
          onClose={() => setOpen(false)}
          onAdded={(row) => {
            setOpen(false);
            setError(null);
            setMessage(`Added ${row.completeName} as No. ${row.no}`);
            setRows((all) => [...all, row]);
          }}
        />
      )}
    </>
  );
}

function AddHcModal({
  rows,
  onClose,
  onAdded,
}: {
  rows: HcRow[];
  onClose: () => void;
  onAdded: (row: HcRow) => void;
}) {
  const [f, setF] = useState({
    idNumber: "",
    email: "",
    familyName: "",
    firstName: "",
    middleName: "",
    nameExtension: "",
    clientName: "",
    clientId: "",
    division: "",
    costCenter: "",
    position: "",
    status: "",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const clients = useMemo(() => {
    const m = new Map<string, number | null>();
    rows.forEach((r) => r.clientName && !m.has(r.clientName) && m.set(r.clientName, r.clientId));
    return m;
  }, [rows]);

  // Picking an existing client fills in its Client ID.
  function pickClient(e: { target: { value: string } }) {
    const name = e.target.value;
    const known = clients.get(name);
    setF((s) => ({ ...s, clientName: name, clientId: known != null && !s.clientId ? String(known) : s.clientId }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to add record");
        return;
      }
      onAdded(body.row);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="card modal wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add HC record</h2>
        <p className="muted">No., Date Created and Added by are filled in automatically.</p>

        <div className="form-grid">
          <label>
            ID Number
            <input inputMode="numeric" pattern="[0-9]*" value={f.idNumber} onChange={set("idNumber")} />
          </label>
          <label>
            Email *
            <input type="email" required value={f.email} onChange={set("email")} />
          </label>
          <label>
            Family Name *
            <input required value={f.familyName} onChange={set("familyName")} />
          </label>
          <label>
            First Name *
            <input required value={f.firstName} onChange={set("firstName")} />
          </label>
          <label>
            Middle Name
            <input value={f.middleName} onChange={set("middleName")} />
          </label>
          <label>
            Name Extension
            <input placeholder="Jr., III…" value={f.nameExtension} onChange={set("nameExtension")} />
          </label>
          <label>
            Department / Client name *
            <input required list="hc-clients" value={f.clientName} onChange={pickClient} />
          </label>
          <label>
            Client ID
            <input inputMode="numeric" pattern="[0-9]*" value={f.clientId} onChange={set("clientId")} />
          </label>
          <label>
            Division
            <input list="hc-divisions" value={f.division} onChange={set("division")} />
          </label>
          <label>
            Cost Center
            <input list="hc-costcenters" value={f.costCenter} onChange={set("costCenter")} />
          </label>
          <label>
            Position
            <input value={f.position} onChange={set("position")} />
          </label>
          <label>
            Status
            <input list="hc-statuses" value={f.status} onChange={set("status")} />
          </label>
          <label className="span-2">
            Remarks
            <input value={f.remarks} onChange={set("remarks")} />
          </label>
        </div>

        <datalist id="hc-clients">
          {[...clients.keys()].sort().map((c) => <option key={c} value={c} />)}
        </datalist>
        <datalist id="hc-divisions">
          {distinct(rows.map((r) => r.division)).map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="hc-costcenters">
          {distinct(rows.map((r) => r.costCenter)).map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="hc-statuses">
          {distinct(rows.map((r) => r.status)).map((v) => <option key={v} value={v} />)}
        </datalist>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Adding…" : "Add record"}
          </button>
        </div>
      </form>
    </div>
  );
}
