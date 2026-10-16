import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/admin";
import { getDirectoryPage, type DirectoryKind } from "@/lib/sophos";

export const dynamic = "force-dynamic";

// Fields Sophos lets us sort by. Anything else falls back to newest-first.
const SORTABLE: Record<DirectoryKind, string[]> = {
  users: ["createdAt", "updatedAt", "name", "email"],
  groups: ["createdAt", "updatedAt", "name"],
};

// A page takes 1-3 s to fetch from Sophos, so keep recent pages for a minute.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; payload: unknown }>();

interface RawUser {
  id: string;
  name?: string;
  email?: string;
  groups?: { total?: number; items?: { name?: string; displayName?: string }[] };
  source?: { type?: string };
  createdAt?: string;
  updatedAt?: string;
}

interface RawGroup {
  id: string;
  name?: string;
  description?: string;
  users?: { total?: number };
  source?: { type?: string };
  createdAt?: string;
  updatedAt?: string;
}

const clean = (s: string | undefined) => (s ?? "").replace(/ /g, " ").trim();

// GET /api/sophos/directory?type=users|groups&page=1&pageSize=10&sort=createdAt:desc&search=
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(request.url).searchParams;
  const kind: DirectoryKind = p.get("type") === "groups" ? "groups" : "users";

  const page = Math.max(1, Math.floor(Number(p.get("page"))) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(p.get("pageSize"))) || 10));
  const [field, dir] = (p.get("sort") ?? "").split(":");
  const sort = SORTABLE[kind].includes(field) ? `${field}:${dir === "asc" ? "asc" : "desc"}` : "createdAt:desc";
  const search = (p.get("search") ?? "").trim().slice(0, 100);

  const key = JSON.stringify([kind, page, pageSize, sort, search]);
  const hit = p.get("refresh") === "1" ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.payload);

  try {
    const result =
      kind === "users"
        ? await getDirectoryPage<RawUser>({ kind, page, pageSize, sort, search })
        : await getDirectoryPage<RawGroup>({ kind, page, pageSize, sort, search });

    const items =
      kind === "users"
        ? (result.items as RawUser[]).map((u) => ({
            id: u.id,
            name: clean(u.name),
            email: u.email ?? null,
            groups: (u.groups?.items ?? []).map((g) => clean(g.displayName ?? g.name)).filter(Boolean),
            groupCount: u.groups?.total ?? 0,
            source: u.source?.type ?? "unknown",
            createdAt: u.createdAt ?? null,
            updatedAt: u.updatedAt ?? null,
          }))
        : (result.items as RawGroup[]).map((g) => ({
            id: g.id,
            name: clean(g.name),
            description: clean(g.description) || null,
            userCount: g.users?.total ?? 0,
            source: g.source?.type ?? "unknown",
            createdAt: g.createdAt ?? null,
            updatedAt: g.updatedAt ?? null,
          }));

    const payload = { items, page: result.page, pages: result.pages, total: result.total, sort, pageSize };
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Sophos directory" },
      { status: 502 }
    );
  }
}
