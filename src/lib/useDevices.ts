"use client";

import { useCallback, useEffect, useState } from "react";
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

  // `force` bypasses the server's short-lived cache (used by the Refresh button).
  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(force ? "/api/devices?refresh=1" : "/api/devices", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load devices");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: () => load(true) };
}
