"use client";

import { useEffect, useState } from "react";
import {
  TYPE_LABEL,
  type SearchSnapshot,
  type SnapSection,
  type TypeRow,
  type CampaignDetail,
  type KwRow,
  type StRow,
  type Target,
} from "@/lib/searchSnapshot";
import { formatNumber } from "@/lib/metrics";

const money = (v: number | null, cur: string) =>
  v === null ? "—" : new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

const targetLabel = (t: Target | null) => (!t ? "" : `${t.kind === "min" ? "≥" : "≤"} ${Math.round(t.value * 100)}%`);

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}

// Impression-share cell colored by KPI pass/fail.
function ImpShareCell({ value, pass, target, bold }: { value: number | null; pass: boolean | null; target: Target | null; bold?: boolean }) {
  const color = pass === null ? "var(--foreground)" : pass ? "var(--good)" : "var(--bad)";
  return (
    <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`} style={{ color }}>
      {pct(value)}
      {target && <span className="ml-1 text-[10px] text-[var(--muted)]">{targetLabel(target)}</span>}
    </td>
  );
}

// "Losing X% to budget / Y% to rank" — the actionable reason a campaign misses its KPI.
function LostCell({ lostRank, lostBudget, bold }: { lostRank: number | null; lostBudget: number | null; bold?: boolean }) {
  if (lostRank == null && lostBudget == null) return <td className="px-2 py-1.5 text-right">—</td>;
  const parts: React.ReactNode[] = [];
  if (lostBudget != null && lostBudget > 0.001) parts.push(<span key="b" title="Lost to budget — raise budget">💰 {pct(lostBudget)}</span>);
  if (lostRank != null && lostRank > 0.001) parts.push(<span key="r" title="Lost to rank — raise bids / improve quality & relevance">📉 {pct(lostRank)}</span>);
  return (
    <td className={`px-2 py-1.5 text-right text-[11px] ${bold ? "font-semibold" : ""}`}>
      {parts.length ? <span className="inline-flex gap-2">{parts}</span> : "—"}
    </td>
  );
}

function Row({ r, cur, bold }: { r: TypeRow; cur: string; bold?: boolean }) {
  return (
    <tr className={`border-t border-[var(--card-border)] ${bold ? "bg-[var(--background)]/40" : ""}`}>
      <td className={`px-2 py-1.5 text-left ${bold ? "font-bold" : "font-medium"}`}>{bold ? "Total" : TYPE_LABEL[r.type]}</td>
      <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{formatNumber(r.impressions)}</td>
      <ImpShareCell value={r.impShare} pass={r.pass} target={bold ? null : r.target} bold={bold} />
      <LostCell lostRank={r.lostRank} lostBudget={r.lostBudget} bold={bold} />
      <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{formatNumber(r.clicks)}</td>
      <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{money(r.cpc, cur)}</td>
      <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{pct(r.ctr)}</td>
      <td className={`px-2 py-1.5 text-right ${bold ? "font-semibold" : ""}`}>{money(r.cost, cur)}</td>
    </tr>
  );
}

function KwTable({ rows, cur }: { rows: KwRow[]; cur: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-2 py-1 text-left">Keyword</th>
            <th className="px-2 py-1 text-left">Match</th>
            <th className="px-2 py-1 text-right">Impr</th>
            <th className="px-2 py-1 text-right">Clicks</th>
            <th className="px-2 py-1 text-right">CTR</th>
            <th className="px-2 py-1 text-right">CPC</th>
            <th className="px-2 py-1 text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((k) => (
            <tr key={`${k.text}|${k.matchType}`} className="border-t border-[var(--card-border)]">
              <td className="px-2 py-1 text-left" dir="auto">{k.text}</td>
              <td className="px-2 py-1 text-left text-[10px] text-[var(--muted)]">{k.matchType}</td>
              <td className="px-2 py-1 text-right">{formatNumber(k.impressions)}</td>
              <td className="px-2 py-1 text-right">{formatNumber(k.clicks)}</td>
              <td className="px-2 py-1 text-right">{pct(k.ctr)}</td>
              <td className="px-2 py-1 text-right">{money(k.cpc, cur)}</td>
              <td className="px-2 py-1 text-right">{money(k.cost, cur)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="px-2 py-2 text-center text-[var(--muted)]">No keywords.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StTable({ rows, cur }: { rows: StRow[]; cur: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <th className="px-2 py-1 text-left">Search term</th>
            <th className="px-2 py-1 text-right">Impr</th>
            <th className="px-2 py-1 text-right">Clicks</th>
            <th className="px-2 py-1 text-right">CTR</th>
            <th className="px-2 py-1 text-right">CPC</th>
            <th className="px-2 py-1 text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((s) => (
            <tr key={s.term} className="border-t border-[var(--card-border)]">
              <td className="px-2 py-1 text-left" dir="auto">{s.term}</td>
              <td className="px-2 py-1 text-right">{formatNumber(s.impressions)}</td>
              <td className="px-2 py-1 text-right">{formatNumber(s.clicks)}</td>
              <td className="px-2 py-1 text-right">{pct(s.ctr)}</td>
              <td className="px-2 py-1 text-right">{money(s.cpc, cur)}</td>
              <td className="px-2 py-1 text-right">{money(s.cost, cur)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="px-2 py-2 text-center text-[var(--muted)]">No search terms.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CampaignDetailBlock({ c, cur }: { c: CampaignDetail; cur: string }) {
  const color = c.pass === null ? "var(--foreground)" : c.pass ? "var(--good)" : "var(--bad)";
  const reason =
    c.pass === false
      ? c.lostBudget != null && c.lostRank != null
        ? c.lostBudget >= c.lostRank
          ? "בעיקר תקציב — להגדיל תקציב"
          : "בעיקר דירוג — להעלות הצעות מחיר / איכות ורלוונטיות"
        : ""
      : "";
  return (
    <details className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/30">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-semibold">{TYPE_LABEL[c.type]}</span>
        <span className="text-[11px] text-[var(--muted)]">IS</span>
        <span className="font-bold" style={{ color }}>{pct(c.impShare)}</span>
        {c.target && <span className="text-[10px] text-[var(--muted)]">{targetLabel(c.target)}</span>}
        {c.pass === true && <span className="text-[11px]" style={{ color }}>✓ עומד ביעד</span>}
        {c.pass === false && <span className="text-[11px]" style={{ color }}>✕ מתחת ליעד</span>}
        {reason && <span className="text-[11px] text-[var(--muted)]">· {reason}</span>}
        <span className="ml-auto text-[11px] text-[var(--muted)]">
          {c.lostBudget != null && c.lostBudget > 0.001 && <span title="Lost to budget">💰 {pct(c.lostBudget)}</span>}
          {c.lostRank != null && c.lostRank > 0.001 && <span className="ml-2" title="Lost to rank">📉 {pct(c.lostRank)}</span>}
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--card-border)] px-3 py-3">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">מילות מפתח · top {c.keywords.length}</div>
        <KwTable rows={c.keywords} cur={cur} />
        <div className="pt-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">מונחי חיפוש · top {c.searchTerms.length}</div>
        <StTable rows={c.searchTerms} cur={cur} />
      </div>
    </details>
  );
}

function SectionBlock({ s }: { s: SnapSection }) {
  return (
    <Panel title={`${s.title} · ${s.account}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-1.5 text-left">Type</th>
              <th className="px-2 py-1.5 text-right">Impressions</th>
              <th className="px-2 py-1.5 text-right">Imp Share</th>
              <th className="px-2 py-1.5 text-right">Lost IS</th>
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

      <div className="mt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">ניתוח לפי קמפיין · מילות מפתח ומונחי חיפוש</div>
        {s.campaigns.map((c) => (
          <CampaignDetailBlock key={c.name} c={c} cur={s.currency} />
        ))}
        {s.campaigns.length === 0 && <div className="text-sm text-[var(--muted)]">No campaigns in range.</div>}
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
        <div className="text-[11px] leading-relaxed text-[var(--muted)]">
          קמפיינים מקובצים לפי סוג (Compete / Lead / Participate / Compete Site) · חי מ־Windsor.
          <br />
          יעדי Impression Share: <b>Lead ≥70%</b> · <b>Compete ≥50%</b> · <b>Participate ≤50%</b>.
          ירוק = עומד ביעד, אדום = מתחת. <b>Lost IS</b>: 💰 אובדן לתקציב (להגדיל תקציב) · 📉 אובדן לדירוג (הצעות מחיר / איכות).
          לחיצה על קמפיין פותחת ניתוח מילות מפתח ומונחי חיפוש. Google לא חושף IS ברמת מילת־מפתח.
        </div>
      </Panel>
      {report.sections.map((s) => (
        <SectionBlock key={s.account} s={s} />
      ))}
    </div>
  );
}
