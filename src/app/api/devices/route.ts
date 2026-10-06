import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";
import { listEndpoints } from "@/lib/sophos";

export const dynamic = "force-dynamic";

const CACHE_MS = 2 * 60_000;

interface Payload {
  summary: { total: number; byHealth: Record<string, number> };
  devices: ReturnType<typeof toDevice>[];
  fetchedAt: string;
}

// Sophos takes a few seconds per 500 devices, so reuse the last result for a couple
// of minutes. Every caller is already authorised to see the same tenant data.
let cache: { at: number; payload: Payload } | null = null;

type Endpoint = Awaited<ReturnType<typeof listEndpoints>>[number];

// Collapses per-volume encryption statuses into one state for the device.
function encryptionState(e: Endpoint): { state: string; volumes: number } {
  const statuses = (e.encryption?.volumes ?? []).map((v) => v.status);
  const volumes = statuses.length;
  if (volumes === 0) return { state: "unknown", volumes };

  const count = (s: string) => statuses.filter((x) => x === s).length;
  if (count("encrypted") === volumes) return { state: "encrypted", volumes };
  if (count("encrypting")) return { state: "encrypting", volumes };
  if (count("suspended")) return { state: "suspended", volumes };
  if (count("notSupported") === volumes) return { state: "notSupported", volumes };
  if (count("encrypted")) return { state: "partial", volumes };
  return { state: "notEncrypted", volumes };
}

function toDevice(e: Endpoint) {
  const product = (code: string) => e.assignedProducts?.find((p) => p.code === code);
  const interceptX = product("interceptX") ?? product("endpointProtection");
  const encryptionComponent = product("deviceEncryption");

  return {
    interceptX: interceptX
      ? { status: interceptX.status ?? "unknown", version: interceptX.version ?? null }
      : null,
    encryption: { ...encryptionState(e), component: encryptionComponent?.status ?? null },
    id: e.id,
    hostname: e.hostname,
    type: e.type,
    os: e.os?.name ?? e.os?.platform ?? "Unknown",
    platform: e.os?.platform ?? "unknown",
    isServer: e.os?.isServer ?? false,
    health: e.health?.overall ?? "unknown",
    user: e.associatedPerson?.viaLogin ?? e.associatedPerson?.name ?? null,
    userId: e.associatedPerson?.id ?? null,
    ip: e.ipv4Addresses?.[0] ?? null,
    mac: e.macAddresses?.[0] ?? null,
    serialNumber: e.serialNumber?.trim() || null,
    online: e.online ?? null,
    registeredAt: e.registeredAt ?? null,
    lastSeenAt: e.lastSeenAt ?? null,
    tamperProtection: e.tamperProtectionEnabled ?? null,
  };
}

// GET /api/devices[?refresh=1]
// Returns the devices enrolled in Sophos Central. Requires a signed-in user.
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
    return NextResponse.json(cache.payload);
  }

  try {
    const devices = (await listEndpoints()).map(toDevice);

    const summary = devices.reduce(
      (acc, d) => {
        acc.total++;
        acc.byHealth[d.health] = (acc.byHealth[d.health] ?? 0) + 1;
        return acc;
      },
      { total: 0, byHealth: {} as Record<string, number> }
    );

    const payload: Payload = { summary, devices, fetchedAt: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load devices" },
      { status: 502 }
    );
  }
}
