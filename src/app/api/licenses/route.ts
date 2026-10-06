import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";
import { listLicenses, type SophosLicense } from "@/lib/sophos";

export const dynamic = "force-dynamic";

const CACHE_MS = 2 * 60_000;
let cache: { at: number; licenses: SophosLicense[] } | null = null;

// GET /api/licenses[?refresh=1]
// Licence usage for the tenant. Requires a signed-in user.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ licenses: cache.licenses, fetchedAt: new Date(cache.at).toISOString() });
  }

  try {
    const licenses = await listLicenses();
    cache = { at: Date.now(), licenses };
    return NextResponse.json({ licenses, fetchedAt: new Date(cache.at).toISOString() });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load licenses" },
      { status: 502 }
    );
  }
}
