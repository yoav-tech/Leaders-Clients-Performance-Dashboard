"use client";

import { useState } from "react";
import type { AppCampaign } from "@/lib/appReport";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

export type Col = { label: string; field: keyof AppCampaign; fmt: "ils" | "num" | "pct" };

const fmtVal = (v: unknown, f: Col["fmt"]) =>
  f === "ils" ? formatIls(v as number | null) : f === "pct" ? formatPct(v as number | null) : formatNumber(v as number | null);

function totalsRow(campaigns: AppCampaign[]): AppCampaign {
  const t = campaigns.reduce(
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

export default function AppTypeTable({ campaigns, cols, minWidth = 640 }: { campaigns: AppCampaign[]; cols: Col[]; minWidth?: number }) {
  const [sortField, setSortField] = useState<keyof AppCampaign>(cols[0].field);
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  if (!campaigns.length) return <div className="py-3 text-sm text-[var(--muted)]">No LDRS campaigns of this type in range.</div>;

  const toggle = (f: keyof AppCampaign) => {
    if (f === sortField) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(f); setDir("desc"); }
  };
  const sorted = [...campaigns].sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return dir === "desc" ? bn - an : an - bn;
  });
  const tot = totalsRow(campaigns);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-2 py-1.5 text-left">Campaign</th>
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
              <td className="max-w-[240px] truncate px-2 py-1.5 text-left font-medium" title={r.name}>{r.name}</td>
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
  );
}
