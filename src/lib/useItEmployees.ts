"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ItRow } from "@/lib/itMonitoring";

// Loads the GT - IT Monitoring records (used by the Finance reports).
export function useItEmployees() {
  const router = useRouter();
  const [employees, setEmployees] = useState<ItRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/it-monitoring", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = await res.json().catch(() => ({ error: `Server error (HTTP ${res.status})` }));
      if (!res.ok) {
        setError(body.error ?? "Failed to load GT - IT Monitoring");
        return;
      }
      setError(null);
      setEmployees(body.rows);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { employees, loading, error, reload };
}
