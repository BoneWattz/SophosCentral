"use client";

import { useMemo, useState } from "react";
import { downloadXlsx } from "@/lib/exportExcel";
import { IconDownload } from "./icons";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices, type Device } from "@/lib/useDevices";
import { useItEmployees } from "@/lib/useItEmployees";
import { useLicenses } from "@/lib/useLicenses";
import { lookupPerson, usePeople } from "@/lib/usePeople";
import { firstValue, groupByPerson, lowerEmail, ownerIndex } from "@/lib/itMonitoring";

type Match = "matched" | "temporary" | "noEmail";

// Estimated state of a device against "Sophos Endpoint - User" licence usage (see licenseStates).
type LicenseState = "counted" | "shared" | "noUser" | "noIx" | "server";

const LICENSE_LABEL: Record<LicenseState, string> = {
  counted: "Counted",
  shared: "Shares the user's licence",
  noUser: "Not counted: no user",
  noIx: "Not counted: no Intercept X",
  server: "Server licence (separate)",
};

// One line per Sophos device. Employee details come from GT - IT Monitoring when the Sophos email matches a record.
interface Row {
  key: string;
  hostname: string;
  sophosEmail: string | null;
  ms365Email: string | null; // from GT - IT Monitoring, or a copy of the Sophos email when there is no match
  groups: string[];
  idNumber: number | null;
  fullName: string | null;
  match: Match;
  pending: boolean; // owner known but email not loaded yet
  ixVersion: string | null;
  ixStatus: string | undefined;
  health: string;
  online: boolean | null;
  registeredAt: string | null;
  lastSeenAt: string | null;
  license: LicenseState;
}

const MATCH_LABEL: Record<Match, string> = {
  matched: "Matched",
  temporary: "Temporary MS 365 email",
  noEmail: "No Sophos email",
};

// Works out each device's licence state. A person is identified by MS 365 email (so two Sophos users with the
// same MS 365 email are one person); `keyOf` returns that key. Per person: the Intercept X device seen most
// recently is the one that counts, and their other devices share that licence. There is no inactivity cut-off.
function licenseStates(devices: Device[], keyOf: (d: Device) => string | null): Map<string, LicenseState> {
  const installed = (d: Device) => d.interceptX?.status === "installed";
  const seen = (d: Device) => (d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0);

  const best = new Map<string, Device>(); // person -> most recently seen Intercept X device
  for (const d of devices) {
    const key = keyOf(d);
    if (d.isServer || !key || !installed(d)) continue;
    const cur = best.get(key);
    if (!cur || seen(d) > seen(cur)) best.set(key, d);
  }

  const out = new Map<string, LicenseState>();
  for (const d of devices) {
    const key = keyOf(d);
    let state: LicenseState;
    if (d.isServer) state = "server";
    else if (!key) state = "noUser";
    else if (!installed(d)) state = "noIx";
    else state = best.get(key)!.id === d.id ? "counted" : "shared";
    out.set(d.id, state);
  }
  return out;
}

const dash = (v: string | number | null) => (v === null || v === "" ? "—" : v);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const toDate = (iso: string | null) => (iso ? new Date(iso) : null);
const timestamp = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
const installLabel = (status: string | undefined) =>
  status === "installed" ? "Installed" : status === "notInstalled" ? "Not installed" : "Unknown";
const licenseClass = (s: LicenseState) => (s === "counted" ? "good" : s === "shared" || s === "server" ? "" : "warn");

const columns: Column<Row>[] = [
  { header: "Hostname", render: (r) => r.hostname, sort: (r) => r.hostname },
  {
    header: "Sophos Email",
    render: (r) => r.sophosEmail ?? (r.pending ? <span className="muted">…</span> : "—"),
    sort: (r) => r.sophosEmail,
  },
  {
    header: "MS 365 Email",
    render: (r) =>
      !r.ms365Email ? (
        "—"
      ) : r.match === "temporary" ? (
        <>
          {r.ms365Email} <span className="badge warn" title="Not in GT - IT Monitoring. Copied from the Sophos email for now.">Temporary</span>
        </>
      ) : (
        r.ms365Email
      ),
    sort: (r) => r.ms365Email,
  },
  {
    header: "Group",
    render: (r) =>
      r.groups.length ? (
        r.groups.map((g) => (
          <span key={g} className="badge" style={{ marginRight: 4 }}>
            {g}
          </span>
        ))
      ) : r.pending ? (
        <span className="muted">…</span>
      ) : (
        "—"
      ),
    sort: (r) => r.groups.join(", "),
  },
  { header: "ID Number", render: (r) => dash(r.idNumber), sort: (r) => r.idNumber },
  { header: "Full Name", render: (r) => dash(r.fullName), sort: (r) => r.fullName },
  { header: "Intercept X version", render: (r) => r.ixVersion ?? "—", sort: (r) => r.ixVersion },
  {
    header: "Intercept X",
    render: (r) => <span className={`badge ${r.ixStatus === "installed" ? "good" : r.ixStatus === "notInstalled" ? "bad" : ""}`}>{installLabel(r.ixStatus)}</span>,
    sort: (r) => installLabel(r.ixStatus),
  },
  { header: "Health", render: (r) => <span className={`badge ${r.health}`}>{r.health}</span>, sort: (r) => r.health },
  {
    header: "Online",
    render: (r) => (r.online === null ? "—" : <span className={`badge ${r.online ? "good" : ""}`}>{r.online ? "Online" : "Offline"}</span>),
    sort: (r) => r.online,
  },
  { header: "Registered", render: (r) => fmtDate(r.registeredAt), sort: (r) => timestamp(r.registeredAt) },
  { header: "Last seen", render: (r) => fmtDate(r.lastSeenAt), sort: (r) => timestamp(r.lastSeenAt) },
  {
    header: "Sophos Endpoint - User license",
    render: (r) => <span className={`badge ${licenseClass(r.license)}`} style={{ textTransform: "none" }}>{LICENSE_LABEL[r.license]}</span>,
    sort: (r) => LICENSE_LABEL[r.license],
  },
];

const searchText = (r: Row) =>
  [r.hostname, r.sophosEmail, r.ms365Email, r.groups.join(" "), r.idNumber, r.fullName, r.ixVersion].filter((v) => v !== null).join(" ");

const exportColumns: ExportConfig<Row>["columns"] = [
  { header: "Hostname", value: (r) => r.hostname, width: 26 },
  { header: "Sophos Email", value: (r) => r.sophosEmail, width: 34 },
  { header: "MS 365 Email", value: (r) => r.ms365Email, width: 34 },
  { header: "Group", value: (r) => r.groups.join("; "), width: 28 },
  { header: "ID Number", value: (r) => r.idNumber, width: 12 },
  { header: "Full Name", value: (r) => r.fullName, width: 32 },
  { header: "Intercept X version", value: (r) => r.ixVersion, width: 20 },
  { header: "Intercept X", value: (r) => installLabel(r.ixStatus), width: 14 },
  { header: "Health", value: (r) => r.health, width: 12 },
  { header: "Online", value: (r) => (r.online === null ? null : r.online ? "Online" : "Offline"), width: 10 },
  { header: "Registered", value: (r) => toDate(r.registeredAt), width: 18 },
  { header: "Last seen", value: (r) => toDate(r.lastSeenAt), width: 18 },
  { header: "Sophos Endpoint - User license", value: (r) => LICENSE_LABEL[r.license], width: 36 },
  { header: "MS 365 Email source", value: (r) => MATCH_LABEL[r.match], width: 26 },
];

export default function FinanceEndpointView() {
  const devicesState = useDevices();
  const licensesState = useLicenses();
  const it = useItEmployees();
  const devices = useMemo(() => devicesState.data?.devices ?? [], [devicesState.data]);

  const userIds = useMemo(
    () => Array.from(new Set(devices.map((d) => d.userId).filter((id): id is string => !!id))),
    [devices]
  );
  const people = usePeople(userIds);

  // GT - IT Monitoring people, and which one owns each email.
  const index = useMemo(() => {
    const list = groupByPerson(it.employees);
    return { list, owner: ownerIndex(list) };
  }, [it.employees]);

  const rows = useMemo<Row[]>(() => {
    // 1. Who owns each device: MS 365 email from GT - IT Monitoring, or a temporary copy of the Sophos email.
    const owners = devices.map((d) => {
      const p = lookupPerson(d.userId);
      const sophosEmail = p?.email ?? null;
      const e = lowerEmail(sophosEmail);
      const i = e ? index.owner.get(e) : undefined;
      const person = i === undefined ? null : index.list[i];
      return {
        p,
        sophosEmail,
        person,
        ms365Email: person ? firstValue(person, "ms365Email") : sophosEmail,
        match: (person ? "matched" : sophosEmail ? "temporary" : "noEmail") as Match,
      };
    });

    // 2. Licence state, one person = one MS 365 email (before emails load, fall back to the Sophos user id).
    const ownerOf = new Map(devices.map((d, i) => [d.id, owners[i]]));
    const states = licenseStates(devices, (d) => {
      if (!d.userId) return null;
      const email = lowerEmail(ownerOf.get(d.id)?.ms365Email);
      return email ?? `user:${d.userId}`;
    });

    return devices.map((d, i) => {
      const o = owners[i];
      return {
        key: d.id,
        hostname: d.hostname,
        sophosEmail: o.sophosEmail,
        ms365Email: o.ms365Email,
        groups: o.p?.groups ?? [],
        idNumber: o.person ? firstValue(o.person, "idNumber") : null,
        fullName: o.person ? firstValue(o.person, "completeName") : null,
        match: o.match,
        pending: !!d.userId && o.p === undefined,
        ixVersion: d.interceptX?.version ?? null,
        ixStatus: d.interceptX?.status,
        health: d.health,
        online: d.online,
        registeredAt: d.registeredAt,
        lastSeenAt: d.lastSeenAt,
        license: states.get(d.id) ?? "noUser",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, index, people.version]);

  const filters = useMemo<FilterDef<Row>[]>(
    () => [
      {
        key: "license",
        label: "Sophos Endpoint - User license",
        options: (Object.keys(LICENSE_LABEL) as LicenseState[]).map((s) => ({ value: s, label: LICENSE_LABEL[s] })),
        test: (r, v) => r.license === v,
      },
      {
        key: "match",
        label: "MS 365 email",
        options: (Object.keys(MATCH_LABEL) as Match[]).map((m) => ({ value: m, label: MATCH_LABEL[m] })),
        test: (r, v) => r.match === v && !(v === "noEmail" && r.pending),
      },
      {
        key: "group",
        label: "Group",
        options: [{ value: "__none", label: "(no group)" }, ...distinct(rows.flatMap((r) => r.groups)).map((g) => ({ value: g, label: g }))],
        test: (r, v) => (v === "__none" ? r.groups.length === 0 && !r.pending : r.groups.includes(v)),
      },
      {
        key: "online",
        label: "Connection",
        options: [
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
        ],
        test: (r, v) => (v === "online" ? r.online === true : r.online === false),
      },
    ],
    [rows]
  );

  const ready = !devicesState.loading && !people.loading && !it.loading;
  const loading = devicesState.loading || it.loading || people.loading || licensesState.loading;
  const error = devicesState.error ?? it.error ?? licensesState.error;
  const temporary = rows.filter((r) => r.match === "temporary").length;
  const matched = rows.filter((r) => r.match === "matched").length;

  const count = (s: LicenseState) => rows.filter((r) => r.license === s).length;
  const counted = count("counted");
  const sophosUsers = licensesState.licenses.find((l) => l.code === "CIXA-MSP")?.count;

  // Per-person file for finance: one row per person (MS 365 email) with all their devices in one cell.
  interface PersonLine {
    idNumber: number | null;
    name: string | null;
    client: string;
    email: string | null;
    devices: string[];
  }
  const personKey = (r: Row) => lowerEmail(r.ms365Email) ?? `device:${r.key}`; // no email = its own line
  // The people come from the rows currently shown (so search and filters such as licence = Counted apply),
  // but each person lists ALL of their devices, including the ones sharing the licence.
  function personLines(shown: Row[]): PersonLine[] {
    const wanted = new Set(shown.map(personKey));
    const byKey = new Map<string, PersonLine>();
    for (const r of rows) {
      const key = personKey(r);
      if (!wanted.has(key)) continue;
      const line = byKey.get(key) ?? { idNumber: null, name: null, client: "", email: r.ms365Email, devices: [] };
      line.idNumber = line.idNumber ?? r.idNumber;
      line.name = line.name ?? r.fullName;
      const clients = new Set(line.client ? line.client.split("; ") : []);
      r.groups.forEach((g) => clients.add(g));
      line.client = Array.from(clients).join("; ");
      line.devices.push(r.hostname);
      byKey.set(key, line);
    }
    return Array.from(byKey.values()).sort((a, b) => (a.email ?? "~").localeCompare(b.email ?? "~"));
  }

  const [exportingPeople, setExportingPeople] = useState(false);
  async function exportPeople(lines: PersonLine[]) {
    setExportingPeople(true);
    try {
      await downloadXlsx<PersonLine>(
        "finance-by-person",
        [
          { header: "ID Number", value: (l) => l.idNumber, width: 12 },
          { header: "Name", value: (l) => l.name, width: 32 },
          { header: "Client", value: (l) => l.client, width: 30 },
          { header: "Email", value: (l) => l.email, width: 34 },
          {
            header: "Devices",
            value: (l) => l.devices.sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).join(", "),
            width: 50,
          },
        ],
        lines
      );
    } catch (err) {
      console.error(err);
      alert("Couldn't create the Excel file. Please try again.");
    } finally {
      setExportingPeople(false);
    }
  }

  const exportConfig = useMemo<ExportConfig<Row>>(
    () => ({
      fileName: "finance-report-sophos-endpoint",
      columns: exportColumns,
      disabledReason: ready ? undefined : "Still matching devices. Export will be ready in a moment.",
    }),
    [ready]
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Finance - Sophos Endpoint</h1>
          <p className="muted">
            {ready
              ? `${rows.length.toLocaleString()} devices · ${matched.toLocaleString()} matched to GT - IT Monitoring · ${temporary.toLocaleString()} with a temporary MS 365 email`
              : "Matching Sophos devices to GT - IT Monitoring…"}
          </p>
        </div>
        <div className="actions">
          <button
            className="btn"
            disabled={loading}
            onClick={() => {
              devicesState.reload();
              licensesState.reload();
              it.reload();
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}
      {people.failed > 0 && !people.loading && (
        <p className="error" style={{ marginBottom: 12 }}>
          Couldn&apos;t load the email for {people.failed.toLocaleString()} Sophos users.{" "}
          <button className="link-btn" onClick={people.retry}>
            Retry
          </button>
        </p>
      )}

      {devices.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <strong>Sophos Endpoint - User licence:</strong>{" "}
            Sophos reports <strong>{sophosUsers === undefined ? "…" : sophosUsers.toLocaleString()}</strong> in use. This report estimates{" "}
            <strong>{counted.toLocaleString()}</strong>
            {sophosUsers !== undefined && (
              <>
                {" "}
                (difference {(counted - sophosUsers) >= 0 ? "+" : ""}
                {(counted - sophosUsers).toLocaleString()})
              </>
            )}
            .
          </div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {rows.length.toLocaleString()} devices = {counted.toLocaleString()} counted + {count("shared").toLocaleString()} sharing a user&apos;s licence +{" "}
            {count("noUser").toLocaleString()} without a user +{" "}
            {count("noIx").toLocaleString()} without Intercept X + {count("server").toLocaleString()} server.
          </div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Sophos doesn&apos;t publish how it counts. The estimate counts each person (one MS 365 email) once when one of their devices has
            Intercept X installed, however long ago it was seen. Sophos appears to leave out some users who have been idle for months, so a
            difference of a few is expected.
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        searchText={searchText}
        searchPlaceholder="Search hostname, email, group, ID number or name…"
        filters={filters}
        exportConfig={exportConfig}
        columnToggle
        toolbarExtra={(shown: Row[]) => {
          const lines = personLines(shown);
          return (
            <button
              type="button"
              className="btn secondary filter-btn"
              onClick={() => exportPeople(lines)}
              disabled={exportingPeople || !ready || lines.length === 0}
              title={ready ? `Download ${lines.length.toLocaleString()} people for the rows shown (one row each, all devices in one cell)` : "Still matching devices. Export will be ready in a moment."}
            >
              <IconDownload size={16} />
              {exportingPeople ? "Exporting…" : "Export by person"}
            </button>
          );
        }}
        loading={devicesState.loading}
        emptyText="No devices found"
      />
    </>
  );
}
