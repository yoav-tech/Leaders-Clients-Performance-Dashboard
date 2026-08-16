"use client";

import { useMemo, useState } from "react";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";
import { aggregateRows, citiesOf, type AppRow, type AggRow } from "@/lib/appRows";
import { AD_LEVELS, AD_LEVEL_LABELS, type AdLevel } from "@/lib/adLevel";

export type Col = { label: string; field: keyof AggRow; fmt: "ils" | "num" | "pct" };

const fmtVal = (v: unknown, f: Col["fmt"]) =>
  f === "ils" ? formatIls(v as number | null) : f === "pct" ? formatPct(v as number | null) : formatNumber(v as number | null);

function totalsRow(agg: AggRow[]): AggRow {
  const t = agg.reduce(
    (a, c) => ({
      spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, reach: a.reach + c.reach,
      installs: a.installs + c.installs, registrations: a.registrations + c.registrations, purchases: a.purchases + c.purchases, leads: a.leads + c.leads,
    }),
    { spend: 0, impressions: 0, clicks: 0, reach: 0, installs: 0, registrations: 0, purchases: 0, leads: 0 },
  );
  return {
    name: "Total", type: "other", ...t,
    ctr: t.impressions ? t.clicks / t.impressions : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpi: t.installs ? t.spend / t.installs : null,
    cpReg: t.registrations ? t.spend / t.registrations : null,
    cpPurch: t.purchases ? t.spend / t.purchases : null,
    cpLead: t.leads ? t.spend / t.leads : null,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
  };
}

// One per-type table with its own Campaign / Ad-group / Ad drill + city filter. `rows` are the
// ad-level rows already narrowed to this table's type by the parent.
export default function AppLevelTable({ rows, cols, minWidth = 640 }: { rows: AppRow[]; cols: Col[]; minWidth?: number }) {
  const [level, setLevel] = useState<AdLevel>("campaign");
  const [city, setCity] = useState<string>("all");
  const [sortField, setSortField] = useState<keyof AggRow>(cols[0].field);
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const cities = useMemo(() => citiesOf(rows), [rows]);
  const filtered = useMemo(() => (city === "all" ? rows : rows.filter((r) => r.city === city)), [rows, city]);
  const agg = useMemo(() => aggregateRows(filtered, level), [filtered, level]);

  const toggle = (f: keyof AggRow) => {
    if (f === sortField) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(f); setDir("desc"); }
  };
  const sorted = useMemo(() => [...agg].sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return dir === "desc" ? bn - an : an - bn;
  }), [agg, sortField, dir]);
  const tot = totalsRow(agg);

  return (
    <div>
      {/* Controls: level drill + city filter */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--card-border)]">
          {AD_LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1.5 text-xs font-medium ${l === level ? "bg-blue-600 text-white" : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >
              {AD_LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          עיר
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none"
            disabled={!cities.length}
          >
            <option value="all">כל הערים{cities.length ? ` (${cities.length})` : ""}</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <div className="py-3 text-sm text-[var(--muted)]">אין נתונים לטווח / לפילטר הזה.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth }}>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">{AD_LEVEL_LABELS[level]}</th>
                {cols.map((c) => (
                  <th key={String(c.field)} onClick={() => toggle(c.field)} className={`px-2 py-1.5 text-right cursor-pointer select-none hover:text-[var(--foreground)] ${c.field === sortField ? "text-[var(--foreground)]" : ""}`}>
                    {c.label}{c.field === sortField ? (dir === "desc" ? " ▼" : " ▲") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sorted.map((r) => (
                <tr key={r.name} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-left font-medium" title={r.name} dir="ltr">{r.name}</td>
                  {cols.map((c) => (
                    <td key={String(c.field)} className="px-2 py-1.5 text-right">{fmtVal(r[c.field], c.fmt)}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                <td className="px-2 py-1.5 text-left">Total</td>
                {cols.map((c) => (
                  <td key={String(c.field)} className="px-2 py-1.5 text-right">{fmtVal(tot[c.field], c.fmt)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
