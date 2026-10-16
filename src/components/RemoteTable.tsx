"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAGE_SIZES, pageList } from "@/lib/pageList";
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconChevronRight, IconSort } from "./icons";

export interface RemoteColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  // Field name the server sorts by. Leave out for columns that can't be sorted.
  sortKey?: string;
}

type SortDir = "asc" | "desc";

interface Props<T> {
  // e.g. "/api/sophos/directory?type=users". Page, size, sort and search are appended.
  endpoint: string;
  columns: RemoteColumn<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  emptyText?: string;
  // Sort used on first load and when a sort is cleared. Defaults to newest first.
  defaultSort?: { key: string; dir: SortDir };
  // Change this number to reload the current page from the source (skips the server cache).
  refreshToken?: number;
  onError?: (message: string | null) => void;
}

// A table whose paging, sorting and searching happen on the server, for data sets too big to
// download whole (e.g. ~4,500 Sophos directory users). Looks and behaves like DataTable.
export default function RemoteTable<T>({
  endpoint,
  columns,
  rowKey,
  searchPlaceholder = "Search…",
  emptyText = "No records found",
  defaultSort = { key: "createdAt", dir: "desc" },
  refreshToken = 0,
  onError,
}: Props<T>) {
  const router = useRouter();
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState(defaultSort);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch((prev) => {
        const next = input.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const ctrl = new AbortController();
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("sort", `${sort.key}:${sort.dir}`);
    if (search) url.searchParams.set("search", search);
    if (refreshToken > 0) url.searchParams.set("refresh", "1");

    setLoading(true);
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
        if (!res.ok) {
          onErrorRef.current?.(body.error ?? "Failed to load data");
          return;
        }
        onErrorRef.current?.(null);
        setRows(body.items);
        setTotal(body.total);
        setPages(Math.max(1, body.pages));
        setLoading(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded by a newer request
        onErrorRef.current?.("Could not reach the server. Check your connection and try again.");
      }
    })().finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });

    return () => ctrl.abort();
  }, [endpoint, page, pageSize, sort, search, refreshToken, router]);

  // Click a header: ascending, then descending, then back to the default order.
  // The default column (newest first) just flips between the two directions.
  function toggleSort(key: string) {
    setPage(1);
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (key === defaultSort.key) return { key, dir: s.dir === "asc" ? "desc" : "asc" };
      return s.dir === "asc" ? { key, dir: "desc" } : defaultSort;
    });
  }

  const current = Math.min(page, pages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = (current - 1) * pageSize + rows.length;

  return (
    <div className="card table-card">
      <div className="table-toolbar">
        <input placeholder={searchPlaceholder} value={input} onChange={(e) => setInput(e.target.value)} />
      </div>

      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = !!c.sortKey && sort.key === c.sortKey;
                return (
                  <th key={c.header} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortKey ? (
                      <button
                        type="button"
                        className={`sort-btn${active ? " active" : ""}`}
                        onClick={() => toggleSort(c.sortKey!)}
                        title={`Sort by ${c.header}`}
                      >
                        {c.header}
                        {active ? sort.dir === "asc" ? <IconArrowUp size={12} /> : <IconArrowDown size={12} /> : <IconSort size={12} />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.header}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="empty" colSpan={columns.length}>
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
            {total === 0 ? "Showing 0 of 0" : `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`}
            {search && " (filtered)"}
          </span>
        </div>

        <div className="pager">
          <button disabled={current <= 1 || loading} onClick={() => setPage(1)} aria-label="First page" title="First page">
            «
          </button>
          <button disabled={current <= 1 || loading} onClick={() => setPage(current - 1)} aria-label="Previous page">
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
                disabled={loading && p !== current}
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
          <button disabled={current >= pages || loading} onClick={() => setPage(current + 1)} aria-label="Next page">
            <IconChevronRight size={14} />
          </button>
          <button disabled={current >= pages || loading} onClick={() => setPage(pages)} aria-label="Last page" title="Last page">
            »
          </button>
        </div>
      </div>
    </div>
  );
}
