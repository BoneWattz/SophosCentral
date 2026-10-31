import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";
import { getEndpointsPage, type SophosEndpoint } from "@/lib/sophos";

export const dynamic = "force-dynamic";

const CACHE_MS = 2 * 60_000;

interface PagePayload {
  devices: ReturnType<typeof toDevice>[];
  nextKey: string | null;
}

// Sophos takes a few seconds per 500 devices, so reuse each page for a couple of minutes.
// Every caller is already authorised to see the same tenant data.
const cache = new Map<string, { at: number; payload: PagePayload }>();

// Collapses per-volume encryption statuses into one state for the device.
function encryptionState(e: SophosEndpoint): { state: string; volumes: number } {
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

function toDevice(e: SophosEndpoint) {
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

// GET /api/devices[?pageFromKey=<key>][&refresh=1]
// One chunk (up to 500) of the devices enrolled in Sophos Central, plus `nextKey` for the following
// chunk (null on the last one). The browser keeps asking until nextKey is null. Requires a signed-in user.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const pageFromKey = params.get("pageFromKey") || undefined;
  if (pageFromKey && pageFromKey.length > 2000) {
    return NextResponse.json({ error: "Invalid page key" }, { status: 400 });
  }
  const refresh = params.get("refresh") === "1";

  const key = pageFromKey ?? "";
  const hit = refresh ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.payload);

  try {
    const page = await getEndpointsPage(pageFromKey);
    const payload: PagePayload = { devices: page.items.map(toDevice), nextKey: page.nextKey };
    if (cache.size > 50) cache.clear();
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load devices" },
      { status: 502 }
    );
  }
}
