"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "./icons";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  // Text the search box matches against.
  searchText: (row: T) => string;
  searchPlaceholder?: string;
  initialQuery?: string;
  // Optional dropdown filter (e.g. status). `filterOf` returns the row's value.
  filterOf?: (row: T) => string;
  filterOptions?: string[];
  filterLabel?: string;
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
  actions,
  loading = false,
  emptyText = "No records found",
  pageSize = 8,
}: DataTableProps<T>) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  // The top-bar search can change ?q= while this table stays mounted.
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!filter || filterOf?.(r) === filter) && (!q || searchText(r).toLowerCase().includes(q))
    );
  }, [rows, query, filter, filterOf, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

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
      </div>

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
        <span className="muted">
          Showing {visible.length} of {filtered.length}
          {filtered.length !== rows.length && ` (filtered from ${rows.length})`}
        </span>
        <div className="pager">
          <button disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <IconChevronLeft size={14} />
          </button>
          <span>
            Page {current} of {pages}
          </span>
          <button disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">
            <IconChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
