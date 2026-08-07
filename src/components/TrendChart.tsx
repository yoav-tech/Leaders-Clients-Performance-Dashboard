"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayBreakdown } from "@/lib/types";
import { formatIls, formatNumber, formatPct, formatRoas } from "@/lib/metrics";

type Fmt = "ils" | "roas" | "pct" | "num";
interface Metric {
  key: string;
  label: string;
  group: "store" | "ads";
  fmt: Fmt;
  get: (d: DayBreakdown) => number | null;
}

// Per-day metrics available to trend — mirrors the Store + Ads overview cards.
const ALL_METRICS: Metric[] = [
  { key: "blendedRoas", label: "Blended ROAS", group: "store", fmt: "roas", get: (d) => d.blendedRoas },
  { key: "siteRevenue", label: "Store Revenue", group: "store", fmt: "ils", get: (d) => d.channels.site.revenue },
  { key: "orders", label: "Orders", group: "store", fmt: "num", get: (d) => d.channels.site.purchases },
  { key: "storeAov", label: "Store AOV", group: "store", fmt: "ils", get: (d) => d.channels.site.aov },
  { key: "storeCvr", label: "Store CVR", group: "store", fmt: "pct", get: (d) => (d.total.clicks ? d.channels.site.purchases / d.total.clicks : null) },
  { key: "cac", label: "CAC", group: "store", fmt: "ils", get: (d) => (d.newCustomers ? d.total.spend / d.newCustomers : null) },
  { key: "spend", label: "Spend", group: "ads", fmt: "ils", get: (d) => d.total.spend },
  { key: "adRevenue", label: "Ad Revenue", group: "ads", fmt: "ils", get: (d) => d.total.revenue },
  { key: "adRoas", label: "Ad ROAS", group: "ads", fmt: "roas", get: (d) => d.total.roas },
  { key: "purchases", label: "Purchases", group: "ads", fmt: "num", get: (d) => d.total.purchases },
  { key: "cpa", label: "CPA", group: "ads", fmt: "ils", get: (d) => d.total.cpa },
  { key: "clicks", label: "Clicks", group: "ads", fmt: "num", get: (d) => d.total.clicks },
  { key: "impressions", label: "Impressions", group: "ads", fmt: "num", get: (d) => d.total.impressions },
  { key: "ctr", label: "CTR", group: "ads", fmt: "pct", get: (d) => d.total.ctr },
  { key: "cpc", label: "CPC", group: "ads", fmt: "ils", get: (d) => d.total.cpc },
];

const fmtValue = (v: number | null, fmt: Fmt) =>
  fmt === "ils" ? formatIls(v) : fmt === "roas" ? formatRoas(v) : fmt === "pct" ? formatPct(v) : formatNumber(v);

export default function TrendChart({ data, isClient = false }: { data: DayBreakdown[]; isClient?: boolean }) {
  const metrics = useMemo(() => ALL_METRICS.filter((m) => !(isClient && m.key === "cac")), [isClient]);
  const [key, setKey] = useState("blendedRoas");
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];

  // Chronological ascending, mapped to the selected series.
  const series = useMemo(() => {
    const rows = [...data].sort((a, b) => a.date.localeCompare(b.date));
    return rows.map((d) => ({ date: d.date, y: metric.get(d) }));
  }, [data, metric]);

  const hasData = series.some((p) => p.y !== null && p.y !== undefined);
  const color = "#8b5cf6";

  return (
    <div dir="ltr">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Trend</div>
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
        >
          <optgroup label="Store">
            {metrics.filter((m) => m.group === "store").map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
          <optgroup label="Ads">
            {metrics.filter((m) => m.group === "ads").map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
        </select>
      </div>

      {!hasData ? (
        <div className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">No data for this range.</div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                stroke="var(--card-border)"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                stroke="var(--card-border)"
                width={44}
                tickFormatter={(v: number) => (metric.fmt === "pct" ? `${Math.round(v * 100)}%` : metric.fmt === "roas" ? v.toFixed(1) : formatNumber(v))}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--panel-border)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--muted)" }}
                itemStyle={{ color: "var(--foreground)" }}
                formatter={(v) => [fmtValue(typeof v === "number" ? v : null, metric.fmt), metric.label]}
              />
              <Area type="monotone" dataKey="y" name={metric.label} stroke={color} strokeWidth={2} fill="url(#trend-grad)" connectNulls dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
