"use client";

import { useEffect, useState } from "react";
import type { AwarenessReport, AwSource } from "@/lib/awarenessReport";
import { AD_LEVELS, AD_LEVEL_LABELS, type AdLevel } from "@/lib/adLevel";
import { formatIls, formatNumber } from "@/lib/metrics";

const cpm = (v: number | null) => (v === null ? "—" : `₪${v.toFixed(1)}`);
const cpv = (v: number | null) => (v === null ? "—" : `₪${v.toFixed(3)}`);
const freq = (v: number | null) => (v === null ? "—" : v.toFixed(2));

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}

function SourceBlock({ s, levelLabel }: { s: AwSource; levelLabel: string }) {
  return (
    <Panel title={s.title}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Spend" value={formatIls(s.spend)} />
        <Stat label="Impressions" value={formatNumber(s.impressions)} />
        <Stat label="Reach" value={formatNumber(s.reach)} />
        <Stat label="Frequency" value={freq(s.frequency)} />
        <Stat label="CPM" value={cpm(s.cpm)} />
        <Stat label="Views" value={formatNumber(s.views)} />
        <Stat label="CPV" value={cpv(s.cpv)} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-left">{levelLabel}</th>
              <th className="px-2 py-1.5 text-right">Spend</th>
              <th className="px-2 py-1.5 text-right">Impr</th>
              <th className="px-2 py-1.5 text-right">Reach</th>
              <th className="px-2 py-1.5 text-right">Freq</th>
              <th className="px-2 py-1.5 text-right">CPM</th>
              <th className="px-2 py-1.5 text-right">Views</th>
              <th className="px-2 py-1.5 text-right">100%</th>
              <th className="px-2 py-1.5 text-right">CPV</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.campaigns.map((c) => (
              <tr key={c.name} className="border-t border-[var(--card-border)]">
                <td className="max-w-[240px] truncate px-2 py-1.5 text-left font-medium" title={c.name}>{c.name}</td>
                <td className="px-2 py-1.5 text-right">{formatIls(c.spend)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(c.impressions)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(c.reach)}</td>
                <td className="px-2 py-1.5 text-right">{freq(c.frequency)}</td>
                <td className="px-2 py-1.5 text-right">{cpm(c.cpm)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(c.views)}</td>
                <td className="px-2 py-1.5 text-right">{formatNumber(c.completedViews)}</td>
                <td className="px-2 py-1.5 text-right">{cpv(c.cpv)}</td>
              </tr>
            ))}
            {s.campaigns.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-3 text-center text-[var(--muted)]">No matching campaigns in range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function AwarenessView({
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
  const [report, setReport] = useState<AwarenessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState<AdLevel>("campaign");

  useEffect(() => {
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setErr("");
      fetch(`/api/report/awareness?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}&level=${level}`, { cache: "no-store" })
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
    const iv = setInterval(() => load(false), 90_000); // keep live
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [brandId, from, to, level]);

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;
  const toggle = (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
      {AD_LEVELS.map((lv) => (
        <button key={lv} onClick={() => setLevel(lv)} className={pill(level === lv)}>{AD_LEVEL_LABELS[lv]}</button>
      ))}
    </div>
  );

  if (loading && !report) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{brandName} · awareness</div>{toggle}</div>
        <div className="panel p-10 text-center text-sm text-[var(--muted)]">Loading {brandName}…</div>
      </div>
    );
  }
  if (err && !report) return <div className="panel p-4 text-sm text-[var(--muted)]">Couldn&apos;t load: {err}</div>;
  if (!report) return <div className="panel p-4 text-sm text-[var(--muted)]">No awareness data for this range.</div>;

  const t = report.totals;
  return (
    <div className="space-y-4">
      <Panel title={`${brandName} · awareness · ${from} → ${to}${campaignFilter ? ` · campaigns matching “${campaignFilter}”` : ""}`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Spend" value={formatIls(t.spend)} />
          <Stat label="Impressions" value={formatNumber(t.impressions)} />
          <Stat label="Reach" value={formatNumber(t.reach)} />
          <Stat label="Views" value={formatNumber(t.views)} />
          <Stat label="CPM" value={cpm(t.cpm)} />
          <Stat label="CPV" value={cpv(t.cpv)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--muted)]">Reach/views campaigns · live from Windsor. Meta Views = ThruPlay · TikTok Views = 2s+ (100% col = 6s+).</div>
          {toggle}
        </div>
      </Panel>

      {report.sources.map((s) => (
        <SourceBlock key={s.key} s={s} levelLabel={AD_LEVEL_LABELS[level]} />
      ))}

      {report.trend.length > 0 && (
        <Panel title="Trend · spend & views">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-left">Day</th>
                  <th className="px-2 py-1.5 text-right">Spend</th>
                  <th className="px-2 py-1.5 text-right">Views</th>
                  <th className="px-2 py-1.5 text-right">CPV</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...report.trend].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left font-medium">{d.date.slice(5)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(d.spend)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(d.views)}</td>
                    <td className="px-2 py-1.5 text-right">{cpv(d.views ? d.spend / d.views : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
