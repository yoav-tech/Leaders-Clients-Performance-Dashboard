"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// After first paint, warm the live-today cache for the viewed brand + range, then refresh the
// server components so today's numbers become live. Re-warms periodically while the tab is open.
// The page itself never blocks on this — it renders instantly with the cached snapshot first.
export default function LiveRefresher({ brand, includesToday }: { brand: string; includesToday: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "updating" | "live">("idle");

  useEffect(() => {
    if (!includesToday) return;
    let cancelled = false;

    const tick = async () => {
      setState("updating");
      try {
        await fetch(`/api/live-warm?brand=${encodeURIComponent(brand)}`, { cache: "no-store" });
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setState("live");
      router.refresh(); // re-render server components with the now-warm live cache
    };

    tick();
    const iv = setInterval(tick, 90_000); // keep today fresh
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, includesToday]);

  if (!includesToday) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]" title="Today's numbers update live">
      <span className={`h-2 w-2 rounded-full ${state === "updating" ? "bg-[var(--warn)] animate-pulse" : "bg-[var(--good)]"}`} />
      {state === "updating" ? "updating…" : "live"}
    </span>
  );
}
