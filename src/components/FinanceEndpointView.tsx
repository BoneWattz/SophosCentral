"use client";

import { useMemo } from "react";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices, type Device } from "@/lib/useDevices";
import { useItEmployees } from "@/lib/useItEmployees";
import { useLicenses } from "@/lib/useLicenses";
import { lookupPerson, usePeople } from "@/lib/usePeople";
import { firstValue, groupByPerson, lowerEmail, ownerIndex } from "@/lib/itMonitoring";

type Match = "matched" | "temporary" | "noEmail";

// Estimated state of a device against "Sophos Endpoint - User" licence usage (see licenseStates).
type LicenseState = "counted" | "shared" | "inactive" | "noUser" | "noIx" | "server";

// Sophos doesn't publish how it counts users. This is the closest rule found against this tenant's data:
// a user counts once when one of their devices has Intercept X installed and was seen within this many days.
const ACTIVE_DAYS = 60;

const LICENSE_LABEL: Record<LicenseState, string> = {
  counted: "Counted",
  shared: "Shares the user's licence",
  inactive: `Not counted: user inactive ${ACTIVE_DAYS}+ days`,
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

// Works out each device's licence state. Per user: the Intercept X device seen most recently is the one that
// counts; the user's other devices share that licence. A user whose devices were all last seen long ago is not counted.
function licenseStates(devices: Device[]): Map<string, LicenseState> {
  const installed = (d: Device) => d.interceptX?.status === "installed";
  const seen = (d: Device) => (d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0);
  const cutoff = Date.now() - ACTIVE_DAYS * 86_400_000;

  const best = new Map<string, Device>(); // userId -> most recently seen Intercept X device
  for (const d of devices) {
    if (d.isServer || !d.userId || !installed(d)) continue;
    const cur = best.get(d.userId);
    if (!cur || seen(d) > seen(cur)) best.set(d.userId, d);
  }

  const out = new Map<string, LicenseState>();
  for (const d of devices) {
    let state: LicenseState;
    if (d.isServer) state = "server";
    else if (!d.userId) state = "noUser";
    else if (!installed(d)) state = "noIx";
    else {
      const rep = best.get(d.userId)!;
      if (seen(rep) < cutoff) state = "inactive";
      else state = rep.id === d.id ? "counted" : "shared";
    }
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

  const states = useMemo(() => licenseStates(devices), [devices]);

  const rows = useMemo<Row[]>(
    () =>
      devices.map((d) => {
        const p = lookupPerson(d.userId);
        const sophosEmail = p?.email ?? null;
        const e = lowerEmail(sophosEmail);
        const i = e ? index.owner.get(e) : undefined;
        const person = i === undefined ? null : index.list[i];

        const base = {
          key: d.id,
          hostname: d.hostname,
          sophosEmail,
          groups: p?.groups ?? [],
          pending: !!d.userId && p === undefined,
          ixVersion: d.interceptX?.version ?? null,
          ixStatus: d.interceptX?.status,
          health: d.health,
          online: d.online,
          registeredAt: d.registeredAt,
          lastSeenAt: d.lastSeenAt,
          license: states.get(d.id) ?? "noUser",
        };
        if (person) {
          return {
            ...base,
            ms365Email: firstValue(person, "ms365Email"),
            idNumber: firstValue(person, "idNumber"),
            fullName: firstValue(person, "completeName"),
            match: "matched" as Match,
          };
        }
        // Sophos email with no GT - IT Monitoring record: copy it as a temporary MS 365 email.
        return {
          ...base,
          ms365Email: sophosEmail,
          idNumber: null,
          fullName: null,
          match: (sophosEmail ? "temporary" : "noEmail") as Match,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, index, states, people.version]
  );

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
            {count("inactive").toLocaleString()} inactive {ACTIVE_DAYS}+ days + {count("noUser").toLocaleString()} without a user +{" "}
            {count("noIx").toLocaleString()} without Intercept X + {count("server").toLocaleString()} server.
          </div>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Sophos doesn&apos;t publish how it counts. The estimate counts each user once when one of their devices has Intercept X installed and was
            seen in the last {ACTIVE_DAYS} days, so a difference of a few is expected.
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
        loading={devicesState.loading}
        emptyText="No devices found"
      />
    </>
  );
}
