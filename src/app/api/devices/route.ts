import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";
import { listEndpoints } from "@/lib/sophos";

export const dynamic = "force-dynamic";

// GET /api/devices
// Returns the devices enrolled in Sophos Central. Requires a signed-in user.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const endpoints = await listEndpoints();

    const devices = endpoints.map((e) => ({
      id: e.id,
      hostname: e.hostname,
      type: e.type,
      os: e.os?.name ?? e.os?.platform ?? "Unknown",
      health: e.health?.overall ?? "unknown",
      user: e.associatedPerson?.viaLogin ?? e.associatedPerson?.name ?? null,
      ip: e.ipv4Addresses?.[0] ?? null,
      lastSeenAt: e.lastSeenAt ?? null,
      tamperProtection: e.tamperProtectionEnabled ?? null,
    }));

    const summary = devices.reduce(
      (acc, d) => {
        acc.total++;
        acc.byHealth[d.health] = (acc.byHealth[d.health] ?? 0) + 1;
        return acc;
      },
      { total: 0, byHealth: {} as Record<string, number> }
    );

    return NextResponse.json({ summary, devices, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load devices" },
      { status: 502 }
    );
  }
}
