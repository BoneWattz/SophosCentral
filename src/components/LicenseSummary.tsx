import type { ReactNode } from "react";
import type { License } from "@/lib/useLicenses";
import { IconMonitor, IconServer, IconUser } from "./icons";

export type Tone = "ok" | "bad" | "warn" | "neutral";

export interface Stat {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: Tone;
}

// What one licence covers. Shown as a badge next to the licence count.
export type LicenseUnit = "user" | "device" | "server";

const UNIT: Record<LicenseUnit, { label: string; icon: ReactNode }> = {
  user: { label: "Per user", icon: <IconUser size={12} /> },
  device: { label: "Per device", icon: <IconMonitor size={12} /> },
  server: { label: "Per server", icon: <IconServer size={12} /> },
};

// Hero card with the licence count (as in "Sophos Endpoint – 1,210 licenses"),
// followed by smaller stat cards for the devices behind it.
export default function LicenseSummary({
  title,
  icon,
  unit,
  license,
  loading,
  stats,
}: {
  title: string;
  icon: ReactNode;
  unit: LicenseUnit;
  license: License | undefined;
  loading: boolean;
  stats: Stat[];
}) {
  const asOf = license?.asOf ? new Date(license.asOf).toLocaleString() : null;
  const u = UNIT[unit];

  return (
    <section className="license-grid">
      <div className="card license-hero">
        <div className="stat-head">
          <span className="label">{title}</span>
          <span className="icon-chip ok">{icon}</span>
        </div>
        <strong>{license ? license.count.toLocaleString() : loading ? "…" : "—"}</strong>
        <div className="license-line">
          <span className="license-unit">licenses in use</span>
          <span className="unit-badge">
            {u.icon}
            {u.label}
          </span>
        </div>
        {license && (
          <p className="muted">
            {license.name}
            <br />
            {license.unlimited ? "Usage-based, no fixed limit" : "Licensed quantity"} · ID {license.licenseIdentifier}
            {asOf && (
              <>
                <br />
                As of {asOf}
              </>
            )}
          </p>
        )}
        {!license && !loading && <p className="muted">No licence of this type found for the tenant.</p>}
      </div>

      {stats.map((s) => (
        <div className="card stat" key={s.label}>
          <div className="stat-head">
            <span className="label">{s.label}</span>
            {s.icon && <span className={`icon-chip ${s.tone ?? "neutral"}`}>{s.icon}</span>}
          </div>
          <strong>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</strong>
        </div>
      ))}
    </section>
  );
}
