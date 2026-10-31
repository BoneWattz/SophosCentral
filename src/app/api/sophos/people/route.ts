import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/admin";
import { getPeopleByIds, MAX_IDS_PER_LOOKUP, type DirectoryPerson } from "@/lib/sophos";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// People rarely change, so remember lookups for 10 minutes. `null` = Sophos has no such user.
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; person: DirectoryPerson | null }>();

// POST /api/sophos/people  { ids: string[] }  (max 50)
// -> { people: { [id]: { email, groups } | null } }
// The Devices page uses this to add each device owner's email and group.
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((v): v is string => typeof v === "string"))] : [];
  if (ids.length === 0 || ids.length > MAX_IDS_PER_LOOKUP || !ids.every((id) => UUID.test(id))) {
    return NextResponse.json(
      { error: `Send 1 to ${MAX_IDS_PER_LOOKUP} user ids` },
      { status: 400 }
    );
  }

  const now = Date.now();
  const people: Record<string, { email: string | null; groups: string[] } | null> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_MS) people[id] = hit.person && { email: hit.person.email, groups: hit.person.groups };
    else missing.push(id);
  }

  if (missing.length) {
    try {
      const found = new Map((await getPeopleByIds(missing)).map((p) => [p.id, p]));
      if (cache.size > 5000) cache.clear();
      for (const id of missing) {
        const person = found.get(id) ?? null;
        cache.set(id, { at: now, person });
        people[id] = person && { email: person.email, groups: person.groups };
      }
    } catch (err) {
      console.error(err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to load users" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ people });
}
