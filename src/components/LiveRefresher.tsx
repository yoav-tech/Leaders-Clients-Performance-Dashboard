"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Keeps a view live after first paint. If `warmPath` is given, it POST-warms that endpoint
// (e.g. re-ingest today) before refreshing; otherwise it just re-renders the server components
// (which re-fetch their own live sources). Runs on mount and on an interval. Non-blocking — the
// page always renders instantly first.
export default function LiveRefresher({
  brand,
  active,
  warmPath,
  intervalMs = 90_000,
}: {
  brand: string;
  active: boolean;
  warmPath?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "updating" | "live">("idle");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const tick = async () => {
      setState("updating");
      if (warmPath) {
        try {
          await fetch(`${warmPath}?brand=${encodeURIComponent(brand)}`, { cache: "no-store" });
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      setState("live");
      router.refresh();
    };

    tick();
    const iv = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, active, warmPath, intervalMs]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]" title="Updates live">
      <span className={`h-2 w-2 rounded-full ${state === "updating" ? "bg-[var(--warn)] animate-pulse" : "bg-[var(--good)]"}`} />
      {state === "updating" ? "updating…" : "live"}
    </span>
  );
}
