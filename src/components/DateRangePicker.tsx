"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RANGE_PRESETS, type RangeKey } from "@/lib/dates";

export default function DateRangePicker({
  activeKey,
  from,
  to,
  brand,
}: {
  activeKey: RangeKey;
  from: string;
  to: string;
  brand?: string;
}) {
  const router = useRouter();
  const brandQ = brand ? `&brand=${brand}` : "";
  const [open, setOpen] = useState(false);
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  // Keep custom inputs in sync when the active range changes.
  useEffect(() => {
    setCFrom(from);
    setCTo(to);
  }, [from, to]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const goPreset = (key: RangeKey) => {
    setOpen(false);
    router.push(`/?range=${key}${brandQ}`);
  };

  const applyCustom = () => {
    if (!cFrom || !cTo) return;
    setOpen(false);
    router.push(`/?range=custom&from=${cFrom}&to=${cTo}${brandQ}`);
  };

  // Shift the current window by ±N days (keeps the window length). Doesn't step past today.
  const shift = (iso: string, days: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const step = (delta: number) => {
    const nextTo = shift(to, delta);
    if (delta > 0 && nextTo > todayStr) return; // don't go into the future
    setOpen(false);
    router.push(`/?range=custom&from=${shift(from, delta)}&to=${nextTo}${brandQ}`);
  };
  const arrowBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30";

  const btn = (isActive: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
    }`;

  return (
    <div className="relative flex flex-wrap items-center gap-2" ref={ref}>
      <button onClick={() => step(-1)} className={arrowBtn} aria-label="Previous day" title="Shift back one day">
        ◀
      </button>
      <button onClick={() => step(1)} disabled={to >= todayStr} className={arrowBtn} aria-label="Next day" title="Shift forward one day">
        ▶
      </button>
      <div className="inline-flex flex-wrap rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1">
        {RANGE_PRESETS.map((p) => (
          <button key={p.key} onClick={() => goPreset(p.key)} className={btn(activeKey === p.key)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => setOpen((o) => !o)} className={btn(activeKey === "custom")}>
          Custom{activeKey === "custom" ? ` · ${from} → ${to}` : ""}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-xl">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">
            Custom range
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
              From
              <input
                type="date"
                value={cFrom}
                max={cTo || undefined}
                onChange={(e) => setCFrom(e.target.value)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)] [color-scheme:dark]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
              To
              <input
                type="date"
                value={cTo}
                min={cFrom || undefined}
                onChange={(e) => setCTo(e.target.value)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)] [color-scheme:dark]"
              />
            </label>
          </div>
          <button
            onClick={applyCustom}
            disabled={!cFrom || !cTo}
            className="mt-3 w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
