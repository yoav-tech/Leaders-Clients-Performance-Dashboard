"use client";

import { useEffect, useState } from "react";
import { TYPE_LABEL, type SearchSnapshot, type SnapSection, type TypeRow } from "@/lib/searchSnapshot";
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

function Cell({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{children}</td>;
}

function Row({ r, cur, bold }: { r: TypeRow; cur: string; bold?: boolean }) {
  return (
    <tr className={`border-t border-[var(--card-border)] ${bold ? "bg-[var(--background)]/40" : ""}`}>
      <td className={`px-2 py-1.5 text-left ${bold ? "font-bold" : "font-medium"}`}>{bold ? "Total" : TYPE_LABEL[r.type]}</td>
      <Cell bold={bold}>{formatNumber(r.impressions)}</Cell>
      <Cell bold={bold}>{pct(r.impShare)}</Cell>
      <Cell bold={bold}>{formatNumber(r.clicks)}</Cell>
      <Cell bold={bold}>{money(r.cpc, cur)}</Cell>
      <Cell bold={bold}>{pct(r.ctr)}</Cell>
      <Cell bold={bold}>{money(r.cost, cur)}</Cell>
    </tr>
  );
}

function SectionBlock({ s }: { s: SnapSection }) {
  return (
    <Panel title={`${s.title} · ${s.account}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-left">Type</th>
              <th className="px-2 py-1.5 text-right">Impressions</th>
              <th className="px-2 py-1.5 text-right">Imp Share</th>
              <th className="px-2 py-1.5 text-right">Clicks</th>
              <th className="px-2 py-1.5 text-right">CPC</th>
              <th className="px-2 py-1.5 text-right">CTR</th>
              <th className="px-2 py-1.5 text-right">Budget Spent</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.rows.map((r) => (
              <Row key={r.type} r={r} cur={s.currency} />
            ))}
            <Row r={s.totals} cur={s.currency} bold />
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function SearchSnapshotView({
  brandId,
  brandName,
  from,
  to,
}: {
  brandId: string;
  brandName: string;
  from: string;
  to: string;
}) {
  const [report, setReport] = useState<SearchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setErr("");
      fetch(`/api/report/search-snapshot?brand=${encodeURIComponent(brandId)}&from=${from}&to=${to}`, { cache: "no-store" })
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
  }, [brandId, from, to]);

  if (loading && !report) return <div className="panel p-10 text-center text-sm text-[var(--muted)]">Loading {brandName}…</div>;
  if (err && !report) return <div className="panel p-4 text-sm text-[var(--muted)]">Couldn&apos;t load: {err}</div>;
  if (!report || report.sections.length === 0) return <div className="panel p-4 text-sm text-[var(--muted)]">No snapshot data for this range.</div>;

  return (
    <div className="space-y-4">
      <Panel title={`${brandName} · Google search snapshot · ${from} → ${to}`}>
        <div className="text-[11px] text-[var(--muted)]">
          Campaigns grouped by competitive type (Compete / Lead / Participate / Compete Site) · live from Windsor. Impression Share is impression-weighted.
        </div>
      </Panel>
      {report.sections.map((s) => (
        <SectionBlock key={s.account} s={s} />
      ))}
    </div>
  );
}
