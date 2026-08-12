"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TYPE_LABEL,
  TYPE_ORDER,
  type ColgateType,
  type SearchSnapshot,
  type SnapSection,
  type SnapTrendPoint,
  type TypeRow,
  type CampaignDetail,
  type KwRow,
  type StRow,
  type Target,
} from "@/lib/searchSnapshot";
import { formatNumber } from "@/lib/metrics";

const CUR_SYM: Record<string, string> = { EUR: "€", ILS: "₪", USD: "$" };

// Impression-share trend with a per-field selector, and a series selector (All / per campaign type)
// so a single type — e.g. Lead (LED) — can be isolated instead of the account-blended line.
interface TrendSeries { key: string; label: string; trend: SnapTrendPoint[] }
function SnapshotTrend({ series, currency }: { series: TrendSeries[]; currency: string }) {
  const sym = CUR_SYM[currency] ?? "";
  const metrics = useMemo(
    () => [
      { key: "impShare", label: "Impression Share", get: (d: SnapTrendPoint) => d.impShare ?? 0, fmt: (v: number) => `${Math.round(v * 100)}%` },
      { key: "impressions", label: "Impressions", get: (d: SnapTrendPoint) => d.impressions, fmt: (v: number) => formatNumber(v) },
      { key: "clicks", label: "Clicks", get: (d: SnapTrendPoint) => d.clicks, fmt: (v: number) => formatNumber(v) },
      { key: "spend", label: "Spend", get: (d: SnapTrendPoint) => d.spend, fmt: (v: number) => `${sym}${formatNumber(Math.round(v))}` },
    ],
    [sym],
  );
  const [key, setKey] = useState("impShare");
  const [seriesKey, setSeriesKey] = useState(series[0]?.key ?? "all");
  const [hover, setHover] = useState<number | null>(null);
  const m = metrics.find((x) => x.key === key) ?? metrics[0];
  const trend = (series.find((s) => s.key === seriesKey) ?? series[0])?.trend ?? [];

  const W = 900, H = 200, PAD = 8;
  const { pts, max } = useMemo(() => {
    const vals = trend.map((d) => m.get(d));
    const max = Math.max(m.key === "impShare" ? 0.01 : 1, ...vals);
    const n = trend.length;
    const x = (i: number) => (n <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
    const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
    return { pts: vals.map((v, i) => ({ x: x(i), y: y(v), v, date: trend[i].date })), max };
  }, [trend, m]);

  if (!trend.length) return <div className="py-6 text-center text-sm text-[var(--muted)]">אין נתוני טרנד לטווח הזה.</div>;

  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const hp = hover != null ? pts[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {series.length > 1 ? (
            <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
              {series.map((sr) => (
                <button key={sr.key} onClick={() => setSeriesKey(sr.key)} className={`rounded-md px-3 py-1 text-sm transition-colors ${seriesKey === sr.key ? "bg-[var(--accent,#6E56F6)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{sr.label}</button>
              ))}
            </div>
          ) : null}
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
            {metrics.map((mm) => (
              <button key={mm.key} onClick={() => setKey(mm.key)} className={`rounded-md px-3 py-1 text-sm transition-colors ${key === mm.key ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{mm.label}</button>
            ))}
          </div>
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
        <span>{trend[0]?.date.slice(5)}</span>
        <span>{trend[trend.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

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
  if (lostBudget != null && lostBudget > 0.001) parts.push(<span key="b" className="inline-flex items-center gap-1" title="Lost to budget — raise budget"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)" }} />{pct(lostBudget)}</span>);
  if (lostRank != null && lostRank > 0.001) parts.push(<span key="r" className="inline-flex items-center gap-1" title="Lost to rank — raise bids / improve quality & relevance"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bad)" }} />{pct(lostRank)}</span>);
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
          {c.lostBudget != null && c.lostBudget > 0.001 && <span className="inline-flex items-center gap-1" title="Lost to budget"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)" }} />{pct(c.lostBudget)}</span>}
          {c.lostRank != null && c.lostRank > 0.001 && <span className="ml-2 inline-flex items-center gap-1" title="Lost to rank"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bad)" }} />{pct(c.lostRank)}</span>}
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

      {s.trend?.length ? (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">Trend · impression share · {s.title} · לפי סוג קמפיין</div>
          <SnapshotTrend
            series={[{ key: "all", label: "הכל", trend: s.trend }, ...s.trendByType.map((t) => ({ key: t.type, label: TYPE_LABEL[t.type], trend: t.trend }))]}
            currency={s.currency}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">ניתוח לפי קמפיין · מילות מפתח ומונחי חיפוש</div>
        {s.campaigns.map((c) => (
          <CampaignDetailBlock key={c.name} c={c} cur={s.currency} />
        ))}
        {s.campaigns.length === 0 && <div className="text-sm text-[var(--muted)]">No campaigns in range.</div>}
      </div>
    </Panel>
  );
}

// One-line, data-driven takeaway for an account's competitive picture (deterministic — no LLM).
function competitorSummary(s: SnapSection): string {
  const t = s.totals;
  const is = t.impShare != null ? Math.round(t.impShare * 100) : null;
  const lr = t.lostRank != null ? Math.round(t.lostRank * 100) : null;
  const lb = t.lostBudget != null ? Math.round(t.lostBudget * 100) : null;
  const top = s.competitors.slice(0, 3).map((c) => c.domain);
  const newCount = s.competitors.filter((c) => c.isNew).length;

  const parts: string[] = [];
  if (is != null) parts.push(`נתח החשיפה שלנו ${is}%`);
  if (lb != null && lr != null && lb >= lr && lb >= 30) {
    parts.push(`הבעיה העיקרית תקציב — ${lb}% מהחשיפות אבדו לתקציב (רק ${lr}% נלקחו ע״י מתחרים בדירוג), אז ההמלצה להעלות תקציב`);
  } else if (lr != null && lr > 0) {
    parts.push(`המתחרים לוקחים ${lr}% מהחשיפות בדירוג${lb ? ` (ועוד ${lb}% אבד לתקציב)` : ""}, אז ההמלצה לחזק הצעות מחיר/איכות`);
  } else if (is != null && is >= 70) {
    parts.push("שליטה טובה בשוק, מעט אובדן חשיפות");
  }
  if (top.length) parts.push(`המתחרים המובילים: ${top.join(", ")}`);
  if (newCount) parts.push(`${newCount} מתחרים חדשים בתקופה`);
  return parts.join(" · ");
}

// Competitors on our search terms (auction insights), one table per account: filterable by the
// campaign type they compete on, with days-active and a NEW badge (vs the previous period).
function CompetitorsBlock({ s }: { s: SnapSection }) {
  const [typeFilter, setTypeFilter] = useState<ColgateType | "all">("all");
  const typesPresent = TYPE_ORDER.filter((t) => s.competitors.some((c) => c.types.includes(t)));
  const rows = s.competitors.filter((c) => typeFilter === "all" || c.types.includes(typeFilter));
  const newCount = s.competitors.filter((c) => c.isNew).length;
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  // Account-level competitive pressure (already in the data): our IS, and how much impression share
  // competitors take from us — split into rank (they outrank us) vs budget, in % and est. impressions.
  const t = s.totals;
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const eligible = t.impShare ? t.impressions / t.impShare : null;
  const lostRankImpr = eligible != null && t.lostRank != null ? Math.round(eligible * t.lostRank) : null;
  const lostBudgetImpr = eligible != null && t.lostBudget != null ? Math.round(eligible * t.lostBudget) : null;
  const sumCell = (label: string, value: string, tone?: string, sub?: string) => (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`text-lg font-bold ${tone ?? ""}`}>{value}</div>
      {sub ? <div className="text-[11px] text-[var(--muted)]">{sub}</div> : null}
    </div>
  );

  return (
    <Panel title={`מתחרים · ${s.title} · ${s.account}`}>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 px-3 py-2.5 text-sm leading-relaxed" dir="rtl">
        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent, #8b5cf6)" }} />
        <span className="text-[var(--foreground)]">{competitorSummary(s)}</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sumCell("נתח החשיפה שלנו", pct(t.impShare), "text-[var(--foreground)]")}
        {sumCell("נלקח ע״י מתחרים · דירוג", pct(t.lostRank), "text-[var(--bad)]", lostRankImpr != null ? `≈ ${formatNumber(lostRankImpr)} חשיפות` : undefined)}
        {sumCell("אבד לתקציב", pct(t.lostBudget), "text-[var(--warn)]", lostBudgetImpr != null ? `≈ ${formatNumber(lostBudgetImpr)} חשיפות` : undefined)}
        {sumCell("סה״כ שוק · חשיפות זמינות", eligible != null ? formatNumber(Math.round(eligible)) : "—", "text-[var(--foreground)]")}
      </div>
      {s.competitors?.length ? (
        <>
          {typesPresent.length ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
                <button onClick={() => setTypeFilter("all")} className={pill(typeFilter === "all")}>הכל</button>
                {typesPresent.map((t) => (
                  <button key={t} onClick={() => setTypeFilter(t)} className={pill(typeFilter === t)}>{TYPE_LABEL[t]}</button>
                ))}
              </div>
              {newCount ? <span className="text-[11px] font-medium text-[var(--good)]">● {newCount} מתחרים חדשים בתקופה</span> : null}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="w-8 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">מתחרה · דומיין</th>
                  <th className="px-2 py-1.5 text-left">סוגי קמפיין</th>
                  <th className="px-2 py-1.5 text-right">קמפיינים</th>
                  <th className="px-2 py-1.5 text-right">ימים פעיל</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((c, i) => (
                  <tr key={c.domain} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]">{i + 1}</td>
                    <td className="px-2 py-1.5 text-left font-medium" dir="ltr">
                      {c.domain}
                      {c.isNew ? <span className="ml-2 rounded bg-[var(--good)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--good)]">חדש</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-left">
                      <span className="flex flex-wrap gap-1">
                        {c.types.length ? c.types.map((t) => (
                          <span key={t} className="rounded border border-[var(--card-border)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{TYPE_LABEL[t]}</span>
                        )) : <span className="text-[var(--muted)]">—</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(c.campaigns)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(c.days)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-2 py-3 text-center text-[var(--muted)]">אין מתחרים בסוג הזה.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
            מדורג לפי <b>ימים פעיל</b> · <b>סוגי קמפיין</b> = על אילו ממונחי החיפוש שלנו הם מתחרים (סנן למעלה) · <b>חדש</b> = הופיע בתקופה זו ולא בקודמת · Google/Windsor לא חושפים את נתח החשיפה של כל מתחרה בנפרד.
          </div>
        </>
      ) : (
        <div className="py-4 text-sm text-[var(--muted)]">אין נתוני מתחרים לטווח הזה.</div>
      )}
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
  const [tab, setTab] = useState<"snapshot" | "competitors">("snapshot");

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

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  return (
    <div className="space-y-4">
      <Panel title={`${brandName} · Google search snapshot · ${from} → ${to}`}>
        <div className="mb-3 inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          <button onClick={() => setTab("snapshot")} className={pill(tab === "snapshot")}>תמונת מצב</button>
          <button onClick={() => setTab("competitors")} className={pill(tab === "competitors")}>מתחרים</button>
        </div>
        {tab === "snapshot" ? (
          <div className="text-[11px] leading-relaxed text-[var(--muted)]">
            קמפיינים מקובצים לפי סוג (Compete / Lead / Participate / Compete Site) · חי מ־Windsor.
            <br />
            יעדי Impression Share: <b>Lead ≥70%</b> · <b>Compete ≥50%</b> · <b>Participate ≤50%</b>.
            ירוק = עומד ביעד, אדום = מתחת. <b>Lost IS</b>: <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--warn)" }} /> אובדן לתקציב (להגדיל תקציב) · <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "var(--bad)" }} /> אובדן לדירוג (הצעות מחיר / איכות).
            לחיצה על קמפיין פותחת ניתוח מילות מפתח ומונחי חיפוש. Google לא חושף IS ברמת מילת־מפתח.
          </div>
        ) : (
          <div className="text-[11px] leading-relaxed text-[var(--muted)]">
            הדומיינים שמתחרים על מונחי החיפוש שלנו (Google Auction Insights), טבלה לכל חשבון. מדורג לפי <b>רוחב חפיפה</b> — במספר הקמפיינים שלנו שהמתחרה מופיע בהם. Google/Windsor לא חושפים את נתח החשיפה של כל מתחרה בנפרד.
          </div>
        )}
      </Panel>
      {tab === "snapshot" ? (
        <>
          {report.trend?.length ? (
            <Panel title="Trend · impression share · כל החשבונות">
              <SnapshotTrend series={[{ key: "all", label: "הכל", trend: report.trend }]} currency={report.currency} />
            </Panel>
          ) : null}
          {report.sections.map((s) => (
            <SectionBlock key={s.account} s={s} />
          ))}
        </>
      ) : (
        report.sections.map((s) => <CompetitorsBlock key={s.account} s={s} />)
      )}
    </div>
  );
}
