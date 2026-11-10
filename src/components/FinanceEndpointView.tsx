"use client";

import { useMemo } from "react";
import DataTable, { type Column, type ExportConfig, type FilterDef } from "./DataTable";
import { useDevices } from "@/lib/useDevices";
import { useItEmployees } from "@/lib/useItEmployees";
import { lookupPerson, usePeople } from "@/lib/usePeople";
import { firstValue, groupByPerson, lowerEmail, ownerIndex } from "@/lib/itMonitoring";

type Match = "matched" | "temporary" | "noEmail";

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
}

const MATCH_LABEL: Record<Match, string> = {
  matched: "Matched",
  temporary: "Temporary MS 365 email",
  noEmail: "No Sophos email",
};

const dash = (v: string | number | null) => (v === null || v === "" ? "—" : v);
const distinct = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

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
];

const searchText = (r: Row) =>
  [r.hostname, r.sophosEmail, r.ms365Email, r.groups.join(" "), r.idNumber, r.fullName].filter((v) => v !== null).join(" ");

const exportColumns: ExportConfig<Row>["columns"] = [
  { header: "Hostname", value: (r) => r.hostname, width: 26 },
  { header: "Sophos Email", value: (r) => r.sophosEmail, width: 34 },
  { header: "MS 365 Email", value: (r) => r.ms365Email, width: 34 },
  { header: "Group", value: (r) => r.groups.join("; "), width: 28 },
  { header: "ID Number", value: (r) => r.idNumber, width: 12 },
  { header: "Full Name", value: (r) => r.fullName, width: 32 },
  { header: "MS 365 Email source", value: (r) => MATCH_LABEL[r.match], width: 26 },
];

export default function FinanceEndpointView() {
  const devicesState = useDevices();
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

  const rows = useMemo<Row[]>(
    () =>
      devices.map((d) => {
        const p = lookupPerson(d.userId);
        const sophosEmail = p?.email ?? null;
        const e = lowerEmail(sophosEmail);
        const i = e ? index.owner.get(e) : undefined;
        const person = i === undefined ? null : index.list[i];

        const base = { key: d.id, hostname: d.hostname, sophosEmail, groups: p?.groups ?? [], pending: !!d.userId && p === undefined };
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
    [devices, index, people.version]
  );

  const filters = useMemo<FilterDef<Row>[]>(
    () => [
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
    ],
    [rows]
  );

  const ready = !devicesState.loading && !people.loading && !it.loading;
  const loading = devicesState.loading || it.loading || people.loading;
  const error = devicesState.error ?? it.error;
  const temporary = rows.filter((r) => r.match === "temporary").length;
  const matched = rows.filter((r) => r.match === "matched").length;

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
