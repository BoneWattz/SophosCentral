import type { License } from "@/lib/useLicenses";

export interface Stat {
  label: string;
  value: string | number;
}

// Hero card with the licence count (as in "Sophos Endpoint – 1,210 licenses"),
// followed by smaller stat cards for the devices behind it.
export default function LicenseSummary({
  title,
  license,
  loading,
  stats,
}: {
  title: string;
  license: License | undefined;
  loading: boolean;
  stats: Stat[];
}) {
  const asOf = license?.asOf ? new Date(license.asOf).toLocaleString() : null;

  return (
    <section className="license-grid">
      <div className="card license-hero">
        <span className="label">{title}</span>
        <strong>{license ? license.count.toLocaleString() : loading ? "…" : "—"}</strong>
        <span className="license-unit">licenses in use</span>
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
          <span className="label">{s.label}</span>
          <strong>{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</strong>
        </div>
      ))}
    </section>
  );
}
