"use client";

import { useEffect, useState } from "react";
import type { CampaignPerf, PerfSource, PerfCampaign } from "@/lib/campaignPerf";
import { formatNumber } from "@/lib/metrics";

const money = (v: number | null, cur: string) =>
  v === null ? "—" : new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)}%`);

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}

function Row({ c, cur, bold }: { c: PerfCampaign; cur: string; bold?: boolean }) {
  const cls = bold ? "font-semibold" : "";
  return (
    <tr className={`border-t border-[var(--card-border)] ${bold ? "bg-[var(--background)]/40" : ""}`}>
      <td className={`max-w-[280px] truncate px-2 py-1.5 text-left ${bold ? "font-bold" : "font-medium"}`} title={c.name} dir="auto">{c.name}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{money(c.spend, cur)}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{formatNumber(c.impressions)}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{formatNumber(c.clicks)}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{pct(c.ctr)}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{money(c.cpc, cur)}</td>
      <td className={`px-2 py-1.5 text-right ${cls}`}>{formatNumber(c.conv)}</td>
    </tr>
  );
}

function SourceBlock({ s }: { s: PerfSource }) {
  return (
    <Panel title={s.title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-left">Campaign</th>
              <th className="px-2 py-1.5 text-right">Spend</th>
              <th className="px-2 py-1.5 text-right">Impr</th>
              <th className="px-2 py-1.5 text-right">Clicks</th>
              <th className="px-2 py-1.5 text-right">CTR</th>
              <th className="px-2 py-1.5 text-right">CPC</th>
              <th className="px-2 py-1.5 text-right">{s.convLabel}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.campaigns.map((c) => (
              <Row key={c.name} c={c} cur={s.currency} />
            ))}
            {s.campaigns.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-3 text-center text-[var(--muted)]">No matching campaigns in range.</td></tr>
            )}
            {s.campaigns.length > 0 && <Row c={s.totals} cur={s.currency} bold />}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function CampaignPerfView({
  brandId,
  brandName,
  campaignFilter,
  from,
  to,
}: {
  brandId: string;
  brandName: string;
  campaignFilter: string;
  from: string;
  to: string;
}) {
  const [report, setReport] = useState<CampaignPerf | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setErr("");
      fetch(`/api/report/campaign-perf?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.error) setErr(j.error);
          else setReport(j.report);
        })
        .catch((e) => !cancelled && setErr(String(e)))
        .finally(() => !cancelled && setLoading(false));
    };
    load(true);
    const iv = setInterval(() => load(false), 90_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [brandId, from, to]);

  if (loading && !report) return <div className="panel p-10 text-center text-sm text-[var(--muted)]">Loading {brandName}…</div>;
  if (err && !report) return <div className="panel p-4 text-sm text-[var(--muted)]">Couldn&apos;t load: {err}</div>;
  if (!report || report.sources.length === 0) return <div className="panel p-4 text-sm text-[var(--muted)]">No campaign data for this range.</div>;

  return (
    <div className="space-y-4">
      <Panel title={`${brandName} · campaign performance · ${from} → ${to} · campaigns matching “${campaignFilter}”`}>
        <div className="text-[11px] text-[var(--muted)]">
          כל הקמפיינים ששמם מכיל “{campaignFilter}” בחשבונות Meta (LEADERS) ו-Google (LDRS) · חי מ-Windsor. Meta conversions = לידים.
        </div>
      </Panel>
      {report.sources.map((s) => (
        <SourceBlock key={s.key} s={s} />
      ))}
    </div>
  );
}
