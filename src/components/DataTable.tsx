"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight, IconFilter } from "./icons";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

const PAGE_SIZES = [10, 25, 50, 100];

// Page buttons to show: first, last, and a window around the current page, with "…" for gaps.
function pageList(current: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, current - 1, current, current + 1]);
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

// One dropdown in the advanced filter panel. A row passes when test(row, selectedValue) is true.
export interface FilterDef<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  test: (row: T, value: string) => boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  // Text the search box matches against.
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  initialQuery?: string;
  // Quick dropdown next to the search box (e.g. status). `filterOf` returns the row's value.
  filterOf?: (row: T) => string;
  filterOptions?: string[];
  filterLabel?: string;
  // Advanced filter panel, toggled with the Filters button.
  filters?: FilterDef<T>[];
  // Trailing cell, e.g. edit/delete buttons.
  actions?: (row: T) => ReactNode;
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchText,
  searchPlaceholder = "Search…",
  initialQuery = "",
  filterOf,
  filterOptions = [],
  filterLabel = "All",
  filters = [],
  actions,
  loading = false,
  emptyText = "No records found",
  pageSize: initialPageSize = 10,
}: DataTableProps<T>) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("");
  const [advanced, setAdvanced] = useState<Record<string, string>>({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [page, setPage] = useState(1);

  // The top-bar search can change ?q= while this table stays mounted.
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const activeFilters = Object.values(advanced).filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = filters.filter((f) => advanced[f.key]);
    return rows.filter(
      (r) =>
        (!filter || filterOf?.(r) === filter) &&
        (!q || searchText(r).toLowerCase().includes(q)) &&
        active.every((f) => f.test(r, advanced[f.key]))
    );
  }, [rows, query, filter, filterOf, searchText, filters, advanced]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  function setAdvancedValue(key: string, value: string) {
    setAdvanced((a) => ({ ...a, [key]: value }));
    setPage(1);
  }

  function clearAll() {
    setAdvanced({});
    setFilter("");
    setQuery("");
    setPage(1);
  }

  const anyFilter = activeFilters > 0 || !!filter || !!query.trim();

  return (
    <div className="card table-card">
      <div className="table-toolbar">
        <input
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        {filterOf && (
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{filterLabel}</option>
            {filterOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {filters.length > 0 && (
          <button
            type="button"
            className={`btn secondary filter-btn${panelOpen ? " on" : ""}`}
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
          >
            <IconFilter size={16} />
            Filters
            {activeFilters > 0 && <span className="count">{activeFilters}</span>}
          </button>
        )}
      </div>

      {panelOpen && filters.length > 0 && (
        <div className="filter-panel">
          <div className="filter-grid">
            {filters.map((f) => (
              <label key={f.key}>
                {f.label}
                <select value={advanced[f.key] ?? ""} onChange={(e) => setAdvancedValue(f.key, e.target.value)}>
                  <option value="">Any</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="filter-actions">
            <span className="muted">{filtered.length} matching</span>
            <button type="button" className="btn secondary" onClick={clearAll} disabled={!anyFilter}>
              Clear all
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
              {actions && <th />}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.header}>{c.render(row)}</td>
                ))}
                {actions && <td className="actions-cell">{actions(row)}</td>}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td className="empty" colSpan={columns.length + (actions ? 1 : 0)}>
                  {loading ? "Loading…" : emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        <div className="foot-left">
          <label className="per-page">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">
            {filtered.length === 0
              ? "Showing 0 of 0"
              : `Showing ${(current - 1) * pageSize + 1}–${(current - 1) * pageSize + visible.length} of ${filtered.length}`}
            {filtered.length !== rows.length && ` (filtered from ${rows.length})`}
          </span>
        </div>

        <div className="pager">
          <button disabled={current <= 1} onClick={() => setPage(1)} aria-label="First page" title="First page">
            «
          </button>
          <button disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <IconChevronLeft size={14} />
          </button>
          {pageList(current, pages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="gap">
                …
              </span>
            ) : (
              <button
                key={p}
                className={p === current ? "current" : ""}
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
          <button disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">
            <IconChevronRight size={14} />
          </button>
          <button disabled={current >= pages} onClick={() => setPage(pages)} aria-label="Last page" title="Last page">
            »
          </button>
        </div>
      </div>
    </div>
  );
}
