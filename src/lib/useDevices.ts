"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface Device {
  id: string;
  hostname: string;
  type: string;
  os: string;
  platform: string;
  isServer: boolean;
  interceptX: { status: string; version: string | null } | null;
  // state: encrypted | partial | notEncrypted | encrypting | suspended | notSupported | unknown
  encryption: { state: string; volumes: number; component: string | null };
  health: string;
  user: string | null;
  userId: string | null;
  ip: string | null;
  mac: string | null;
  serialNumber: string | null;
  online: boolean | null;
  registeredAt: string | null;
  lastSeenAt: string | null;
  tamperProtection: boolean | null;
}

export interface DevicesResponse {
  summary: { total: number; byHealth: Record<string, number> };
  devices: Device[];
  fetchedAt: string;
}

// Loads enrolled devices from /api/devices and sends the user to /login on 401.
export function useDevices() {
  const router = useRouter();
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the latest load may update state (e.g. Refresh clicked while an earlier load is running).
  const run = useRef(0);

  // The API returns up to 500 devices per request (Sophos pages by key), so keep asking for the next
  // chunk until there isn't one. `force` bypasses the server's short-lived cache (the Refresh button).
  const load = useCallback(async (force = false) => {
    const mine = ++run.current;
    setLoading(true);
    setError(null);
    try {
      const devices: Device[] = [];
      let nextKey: string | null = null;
      do {
        const qs = new URLSearchParams();
        if (nextKey) qs.set("pageFromKey", nextKey);
        if (force) qs.set("refresh", "1");
        const res: Response = await fetch(`/api/devices${qs.size ? `?${qs}` : ""}`, { cache: "no-store" });
        if (mine !== run.current) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
        if (!res.ok) throw new Error(body.error ?? "Failed to load devices");
        devices.push(...body.devices);
        nextKey = body.nextKey;
      } while (nextKey);

      const byHealth: Record<string, number> = {};
      for (const d of devices) byHealth[d.health] = (byHealth[d.health] ?? 0) + 1;
      setData({ summary: { total: devices.length, byHealth }, devices, fetchedAt: new Date().toISOString() });
    } catch (err) {
      if (mine === run.current) setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      if (mine === run.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: () => load(true) };
}
