"use client";

import { useMemo, useState } from "react";
import type { CampDay, Profile } from "@/lib/campaignMetrics";
import { formatIls, formatNumber } from "@/lib/metrics";

// Trend with a per-field selector for views/leads brands. SVG area+line, dated x-axis, hover value.

interface Metric { key: string; label: string; get: (d: CampDay) => number; fmt: (v: number) => string; money?: boolean }
const cpv = (v: number) => `₪${v.toFixed(3)}`;

const VIEWS_METRICS: Metric[] = [
  { key: "spend", label: "Spend", get: (d) => d.spend, fmt: (v) => formatIls(v) },
  { key: "views", label: "Views", get: (d) => d.views, fmt: (v) => formatNumber(v) },
  { key: "impressions", label: "Impressions", get: (d) => d.impressions, fmt: (v) => formatNumber(v) },
  { key: "reach", label: "Reach", get: (d) => d.reach, fmt: (v) => formatNumber(v) },
  { key: "cpv", label: "CPV", get: (d) => (d.views ? d.spend / d.views : 0), fmt: cpv },
];
const LEADS_METRICS: Metric[] = [
  { key: "spend", label: "Spend", get: (d) => d.spend, fmt: (v) => formatIls(v) },
  { key: "leads", label: "Leads", get: (d) => d.leads, fmt: (v) => formatNumber(v) },
  { key: "clicks", label: "Clicks", get: (d) => d.clicks, fmt: (v) => formatNumber(v) },
  { key: "impressions", label: "Impressions", get: (d) => d.impressions, fmt: (v) => formatNumber(v) },
  { key: "cpl", label: "CPL", get: (d) => (d.leads ? d.spend / d.leads : 0), fmt: (v) => formatIls(v) },
];

export default function CampaignTrend({ daily, profile }: { daily: CampDay[]; profile: Profile }) {
  const metrics = profile === "views" ? VIEWS_METRICS : LEADS_METRICS;
  const [key, setKey] = useState(metrics[0].key);
  const [hover, setHover] = useState<number | null>(null);
  const m = metrics.find((x) => x.key === key) ?? metrics[0];

  const { pts, max, W, H, PAD } = useMemo(() => {
    const W = 900, H = 200, PAD = 8;
    const vals = daily.map((d) => m.get(d));
    const max = Math.max(1, ...vals);
    const n = daily.length;
    const x = (i: number) => (n <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
    const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v), v, date: daily[i].date }));
    return { pts, max, W, H, PAD };
  }, [daily, m]);

  if (!daily.length) return <div className="py-6 text-center text-sm text-[var(--muted)]">אין נתונים לטווח הזה.</div>;

  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const hp = hover != null ? pts[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {metrics.map((mm) => (
            <button key={mm.key} onClick={() => setKey(mm.key)} className={`rounded-md px-3 py-1 text-sm transition-colors ${key === mm.key ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{mm.label}</button>
          ))}
        </div>
        {hp ? (
          <div className="text-xs text-[var(--muted)]">{hp.date.slice(5)} · <span className="font-semibold text-[var(--foreground)]">{m.fmt(hp.v)}</span></div>
        ) : (
          <div className="text-xs text-[var(--muted)]">מקס׳ {m.fmt(max)}</div>
        )}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full min-w-[520px]" preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const rx = ((e.clientX - r.left) / r.width) * W;
            let best = 0, bd = Infinity;
            pts.forEach((p, i) => { const d = Math.abs(p.x - rx); if (d < bd) { bd = d; best = i; } });
            setHover(best);
          }}>
          <polygon points={area} fill="var(--accent, #6E56F6)" opacity="0.10" />
          <polyline points={line} fill="none" stroke="var(--accent, #6E56F6)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hp ? (
            <>
              <line x1={hp.x} y1={PAD} x2={hp.x} y2={H - PAD} stroke="var(--card-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={hp.x} cy={hp.y} r="3.5" fill="var(--accent, #6E56F6)" />
            </>
          ) : null}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{daily[0]?.date.slice(5)}</span>
        <span>{daily[daily.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
