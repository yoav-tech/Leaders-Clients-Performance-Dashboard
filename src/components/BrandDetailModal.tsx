"use client";

import { useEffect } from "react";
import type { BrandConfig } from "@/lib/brands";
import type { DayBreakdown } from "@/lib/types";
import { formatIls, formatNumber, formatRoas, roasTone } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};

// Vertical divider between platform groups.
const DIV = "border-l border-[var(--card-border)]";

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
  const totalPurchases = Math.round(days.reduce((a, d) => a + d.total.purchases, 0));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="modal-glow my-2 w-full max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-inner">
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
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="sticky left-0 bg-[var(--card)] px-2 py-2 text-left">Day</th>
                  <th className={`px-2 py-2 text-center ${DIV}`} colSpan={3}>Google</th>
                  <th className={`px-2 py-2 text-center ${DIV}`} colSpan={3}>Meta</th>
                  <th className={`px-2 py-2 text-center ${DIV}`} colSpan={3}>TikTok</th>
                  <th className={`px-2 py-2 text-center ${DIV}`} colSpan={2}>Total</th>
                  <th className={`px-2 py-2 text-right ${DIV}`}>Site</th>
                  <th className={`px-2 py-2 text-right ${DIV}`}>Blended</th>
                </tr>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]/70">
                  <th className="sticky left-0 bg-[var(--card)] px-2 pb-2"></th>
                  {["g", "m", "t"].map((c) => (
                    <SubHead key={c} />
                  ))}
                  <th className={`px-2 pb-2 text-right font-normal ${DIV}`}>Spend</th>
                  <th className="px-2 pb-2 text-right font-normal">Rev</th>
                  <th className={`px-2 pb-2 text-right font-normal ${DIV}`}>Rev</th>
                  <th className={`px-2 pb-2 text-right font-normal ${DIV}`}>ROAS</th>
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
                    <td className={`px-2 py-2 text-right ${DIV}`}>{formatIls(d.total.spend)}</td>
                    <td className="px-2 py-2 text-right">{formatIls(d.total.revenue)}</td>
                    <td className={`px-2 py-2 text-right ${DIV}`}>{formatIls(d.channels.site.revenue)}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${DIV} ${TONE[roasTone(d.blendedRoas, target)]}`}>
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
                  <td className={`px-2 py-2 text-right tabular-nums ${DIV}`}>
                    {formatIls(sum(days, (d) => d.total.spend))}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatIls(sum(days, (d) => d.total.revenue))}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${DIV}`}>
                    {formatIls(sum(days, (d) => d.channels.site.revenue))}
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${DIV}`}>
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
              store revenue. Purchases (ads): {formatNumber(totalPurchases)} over {days.length} days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubHead() {
  return (
    <>
      <th className={`px-2 pb-2 text-right font-normal ${DIV}`}>Spend</th>
      <th className="px-2 pb-2 text-right font-normal">Rev</th>
      <th className="px-2 pb-2 text-right font-normal">ROAS</th>
    </>
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
      <td className={`px-2 py-2 text-right ${DIV}`}>{spend ? formatIls(spend) : "—"}</td>
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
      <td className={`px-2 py-2 text-right tabular-nums ${DIV}`}>{formatIls(spend)}</td>
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
