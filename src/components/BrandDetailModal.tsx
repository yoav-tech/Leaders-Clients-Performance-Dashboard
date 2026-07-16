"use client";

import { useEffect } from "react";
import type { BrandConfig } from "@/lib/brands";
import type { DayBreakdown } from "@/lib/types";
import { formatIls, formatRoas, roasTone } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("he-IL", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function BrandDetailModal({
  brand,
  days,
  onClose,
}: {
  brand: BrandConfig;
  days: DayBreakdown[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const target = brand.targetRoas;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative my-2 w-full max-w-6xl rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ ["--glow-color" as string]: "139, 92, 246" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{brand.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              Daily performance · last {days.length} days · target ROAS {target.toFixed(1)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Close ✕
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto p-3 sm:p-4">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="sticky left-0 bg-[var(--card)] px-2 py-2 text-left">Day</th>
                {(["google", "meta", "tiktok"] as const).map((c) => (
                  <th key={c} className="px-2 py-2 text-right" colSpan={3}>
                    {c === "google" ? "Google" : c === "meta" ? "Meta" : "TikTok"}
                  </th>
                ))}
                <th className="px-2 py-2 text-right" colSpan={2}>Total</th>
                <th className="px-2 py-2 text-right">Site</th>
                <th className="px-2 py-2 text-right">Blended</th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]/70">
                <th className="sticky left-0 bg-[var(--card)] px-2 pb-2"></th>
                {["Google", "Meta", "TikTok"].flatMap((c) => [
                  <th key={c + "s"} className="px-2 pb-2 text-right font-normal">Spend</th>,
                  <th key={c + "r"} className="px-2 pb-2 text-right font-normal">Rev</th>,
                  <th key={c + "o"} className="px-2 pb-2 text-right font-normal">ROAS</th>,
                ])}
                <th className="px-2 pb-2 text-right font-normal">Spend</th>
                <th className="px-2 pb-2 text-right font-normal">Rev</th>
                <th className="px-2 pb-2 text-right font-normal">Rev</th>
                <th className="px-2 pb-2 text-right font-normal">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-[var(--card-border)] tabular-nums">
                  <td className="sticky left-0 bg-[var(--card)] px-2 py-2 text-left font-medium">
                    {dayLabel(d.date)}
                  </td>
                  {(["google", "meta", "tiktok"] as const).map((ch) => {
                    const c = d.channels[ch];
                    return (
                      <ChannelCells key={ch} spend={c.spend} revenue={c.revenue} roas={c.roas} target={target} />
                    );
                  })}
                  <td className="px-2 py-2 text-right">{formatIls(d.total.spend)}</td>
                  <td className="px-2 py-2 text-right">{formatIls(d.total.revenue)}</td>
                  <td className="px-2 py-2 text-right">{formatIls(d.channels.site.revenue)}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${TONE[roasTone(d.blendedRoas, target)]}`}>
                    {formatRoas(d.blendedRoas)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--card-border)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <td className="sticky left-0 bg-[var(--card)] px-2 py-2 text-left">7-day totals</td>
                <TotalCells days={days} pick={(c) => c.google} target={target} />
                <TotalCells days={days} pick={(c) => c.meta} target={target} />
                <TotalCells days={days} pick={(c) => c.tiktok} target={target} />
                <td className="px-2 py-2 text-right tabular-nums">{formatIls(sum(days, (d) => d.total.spend))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatIls(sum(days, (d) => d.total.revenue))}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatIls(sum(days, (d) => d.channels.site.revenue))}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {formatRoas(
                    sum(days, (d) => d.total.spend)
                      ? sum(days, (d) => d.channels.site.revenue) / sum(days, (d) => d.total.spend)
                      : null,
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 px-1 text-[11px] text-[var(--muted)]">
            Channel revenue is platform-attributed (can overlap). “Site” and “Blended” use real
            store revenue. Purchases: {days.reduce((a, d) => a + d.total.purchases, 0)} total (ads).
          </p>
        </div>
      </div>
    </div>
  );
}

function ChannelCells({
  spend,
  revenue,
  roas,
  target,
}: {
  spend: number;
  revenue: number;
  roas: number | null;
  target: number;
}) {
  return (
    <>
      <td className="px-2 py-2 text-right">{spend ? formatIls(spend) : "—"}</td>
      <td className="px-2 py-2 text-right">{revenue ? formatIls(revenue) : "—"}</td>
      <td className={`px-2 py-2 text-right ${TONE[roasTone(roas, target)]}`}>{formatRoas(roas)}</td>
    </>
  );
}

function TotalCells({
  days,
  pick,
  target,
}: {
  days: DayBreakdown[];
  pick: (c: DayBreakdown["channels"]) => { spend: number; revenue: number };
  target: number;
}) {
  const spend = sum(days, (d) => pick(d.channels).spend);
  const revenue = sum(days, (d) => pick(d.channels).revenue);
  const roas = spend ? revenue / spend : null;
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums">{formatIls(spend)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{formatIls(revenue)}</td>
      <td className={`px-2 py-2 text-right tabular-nums ${TONE[roasTone(roas, target)]}`}>
        {formatRoas(roas)}
      </td>
    </>
  );
}

function sum(days: DayBreakdown[], pick: (d: DayBreakdown) => number): number {
  return days.reduce((a, d) => a + (pick(d) || 0), 0);
}
