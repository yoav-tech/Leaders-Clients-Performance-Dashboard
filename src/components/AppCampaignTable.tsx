"use client";

import { useState } from "react";
import type { AppCampaign } from "@/lib/appInstall";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

const DIV = "border-l border-[var(--card-border)]";
const sum = (a: AppCampaign[], f: (c: AppCampaign) => number) => a.reduce((s, c) => s + (f(c) || 0), 0);

export default function AppCampaignTable({ campaigns }: { campaigns: AppCampaign[] }) {
  const [sortCol, setSortCol] = useState<keyof AppCampaign>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggle = (col: keyof AppCampaign) => {
    if (col === sortCol) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const sorted = [...campaigns].sort((a, b) => {
    const av = a[sortCol];
    const bv = b[sortCol];
    if (typeof av === "string" || typeof bv === "string") {
      const r = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "desc" ? -r : r;
    }
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return sortDir === "desc" ? bn - an : an - bn;
  });

  const Th = (label: string, col: keyof AppCampaign, align: "left" | "right" = "right", extra = "") => (
    <th onClick={() => toggle(col)} className={`px-2 py-1.5 text-${align} cursor-pointer select-none hover:text-[var(--foreground)] ${col === sortCol ? "text-[var(--foreground)]" : ""} ${extra}`}>
      {label}{col === sortCol ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {Th("Campaign", "name", "left")}
            {Th("Spend", "spend")}
            {Th("Impr", "impressions")}
            {Th("Clicks", "clicks")}
            {Th("CTR", "ctr")}
            {Th("CPC", "cpc")}
            {Th("Downloads", "installs", "right", DIV)}
            {Th("CPI", "cpi")}
            {Th("Reg", "registrations")}
            {Th("CP-Reg", "cpReg")}
            {Th("Purch", "purchases")}
            {Th("CP-Purch", "cpPurch")}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sorted.map((c) => (
            <tr key={c.name} className="border-t border-[var(--card-border)]">
              <td className="max-w-[220px] truncate px-2 py-1.5 text-left font-medium" title={c.name}>{c.name}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(c.clicks)}</td>
              <td className="px-2 py-1.5 text-right">{formatPct(c.ctr)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(c.cpc)}</td>
              <td className={`px-2 py-1.5 text-right font-semibold ${DIV}`}>{formatNumber(c.installs)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(c.cpi)}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(c.registrations)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(c.cpReg)}</td>
              <td className="px-2 py-1.5 text-right">{formatNumber(c.purchases)}</td>
              <td className="px-2 py-1.5 text-right">{formatIls(c.cpPurch)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--card-border)] font-semibold">
            <td className="px-2 py-1.5 text-left">Total</td>
            <td className="px-2 py-1.5 text-right">{formatIls(sum(campaigns, (c) => c.spend))}</td>
            <td className="px-2 py-1.5 text-right">{formatNumber(sum(campaigns, (c) => c.impressions))}</td>
            <td className="px-2 py-1.5 text-right">{formatNumber(sum(campaigns, (c) => c.clicks))}</td>
            <td className="px-2 py-1.5 text-right">—</td>
            <td className="px-2 py-1.5 text-right">—</td>
            <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(sum(campaigns, (c) => c.installs))}</td>
            <td className="px-2 py-1.5 text-right">{formatIls(sum(campaigns, (c) => c.installs) ? sum(campaigns, (c) => c.spend) / sum(campaigns, (c) => c.installs) : null)}</td>
            <td className="px-2 py-1.5 text-right">{formatNumber(sum(campaigns, (c) => c.registrations))}</td>
            <td className="px-2 py-1.5 text-right">{formatIls(sum(campaigns, (c) => c.registrations) ? sum(campaigns, (c) => c.spend) / sum(campaigns, (c) => c.registrations) : null)}</td>
            <td className="px-2 py-1.5 text-right">{formatNumber(sum(campaigns, (c) => c.purchases))}</td>
            <td className="px-2 py-1.5 text-right">{formatIls(sum(campaigns, (c) => c.purchases) ? sum(campaigns, (c) => c.spend) / sum(campaigns, (c) => c.purchases) : null)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
