"use client";

import { useState } from "react";
import type { DayBreakdown } from "@/lib/types";
import type { SourceDaily } from "@/lib/queries";
import { formatIls, formatNumber, formatPct, formatRoas, roasTone } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "",
};
const DIV = "border-l border-[var(--card-border)]";

export default function DailyTable({
  breakdown,
  source,
  target,
  from,
  to,
}: {
  breakdown: DayBreakdown[];
  source: SourceDaily;
  target: number;
  from: string;
  to: string;
}) {
  const [sel, setSel] = useState("all");
  const isAll = sel === "all";
  const srcRows = source.rows[sel] ?? {};

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Daily · {from} → {to}</div>
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          By source
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value="all">All channels</option>
            {source.sources.map((s) => (
              <option key={s.source} value={s.source}>
                {s.source} · ₪{Math.round(s.revenue).toLocaleString("en-US")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        {isAll ? (
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">Day</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Ad Rev</th>
                <th className="px-2 py-1.5 text-right">ROAS</th>
                <th className="px-2 py-1.5 text-right">Purch</th>
                <th className="px-2 py-1.5 text-right">CPA</th>
                <th className={`px-2 py-1.5 text-right ${DIV}`}>Site Rev</th>
                <th className="px-2 py-1.5 text-right">AOV</th>
                <th className="px-2 py-1.5 text-right">CVR</th>
                <th className="px-2 py-1.5 text-right">CAC</th>
                <th className="px-2 py-1.5 text-right">Blended</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {breakdown.map((d) => {
                const site = d.channels.site;
                const aov = site.purchases ? site.revenue / site.purchases : null;
                const cvr = d.total.clicks ? site.purchases / d.total.clicks : null;
                const cac = d.newCustomers ? d.total.spend / d.newCustomers : null;
                return (
                  <tr key={d.date} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.revenue)}</td>
                    <td className={`px-2 py-1.5 text-right ${TONE[roasTone(d.total.roas, target)]}`}>{formatRoas(d.total.roas)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(d.total.purchases)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.total.cpa)}</td>
                    <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatIls(site.revenue)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(aov)}</td>
                    <td className="px-2 py-1.5 text-right">{formatPct(cvr)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(cac)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${TONE[roasTone(d.blendedRoas, target)]}`}>{formatRoas(d.blendedRoas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <>
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Day</th>
                  <th className="px-2 py-1.5 text-right">Orders</th>
                  <th className="px-2 py-1.5 text-right">Revenue</th>
                  <th className="px-2 py-1.5 text-right">AOV</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {breakdown.map((d) => {
                  const v = srcRows[d.date] ?? { orders: 0, revenue: 0 };
                  const aov = v.orders ? v.revenue / v.orders : null;
                  return (
                    <tr key={d.date} className="border-t border-[var(--card-border)]">
                      <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(v.orders)}</td>
                      <td className="px-2 py-1.5 text-right">{formatIls(v.revenue)}</td>
                      <td className="px-2 py-1.5 text-right">{formatIls(aov)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 text-[11px] text-[var(--muted)]">
              Store orders attributed to <span className="text-[var(--foreground)]">{sel}</span> (first-party UTM). Ad spend/ROAS isn&apos;t available per raw source — switch to a channel view for those.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
