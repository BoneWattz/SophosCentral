"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface Person {
  email: string | null;
  groups: string[];
}

const BATCH = 50; // Sophos limit per lookup
const PARALLEL = 8;

// null = looked up, Sophos has no such user. Missing = not looked up yet.
// Module-level so the data survives page changes; a full reload starts fresh.
const cache = new Map<string, Person | null>();

export function lookupPerson(id: string | null): Person | null | undefined {
  return id ? cache.get(id) : null;
}

// Loads email + group for the given directory user ids, in parallel batches of 50,
// after the table has already rendered. `version` changes whenever new results land.
export function usePeople(ids: string[]) {
  const router = useRouter();
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
    let next = 0;
    let failures = 0;

    setLoading(true);
    setFailed(0);

    const worker = async () => {
      while (!cancelled && next < batches.length) {
        const batch = batches[next++];
        try {
          const res = await fetch("/api/sophos/people", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
          if (res.status === 401) {
            router.replace("/login");
            cancelled = true;
            return;
          }
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "lookup failed");
          for (const id of batch) cache.set(id, body.people[id] ?? null);
        } catch {
          failures += batch.length; // left uncached, so Retry picks them up
        }
        if (!cancelled) setVersion((v) => v + 1);
      }
    };

    Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker)).finally(() => {
      if (cancelled) return;
      setFailed(failures);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [ids, retry, router]);

  return { version, loading, failed, retry: () => setRetry((n) => n + 1) };
}
