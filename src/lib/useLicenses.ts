"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface License {
  id: string;
  licenseIdentifier: string;
  code: string;
  genericCode: string | null;
  name: string;
  type: string;
  unlimited: boolean;
  startDate: string | null;
  count: number;
  asOf: string | null;
}

// Loads licence usage from /api/licenses and sends the user to /login on 401.
export function useLicenses() {
  const router = useRouter();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(force ? "/api/licenses?refresh=1" : "/api/licenses", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load licenses");
        setLicenses(body.licenses);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load licenses");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { licenses, loading, error, reload: () => load(true) };
}
