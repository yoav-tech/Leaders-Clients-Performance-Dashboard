"use client";

import { useEffect, useState } from "react";
import { DIMENSION_FIELDS, DIMENSION_LABELS, type Dimension } from "@/lib/breakdowns";
import { formatIls, formatNumber, formatPct } from "@/lib/metrics";

// The unified campaign explorer for views + leads brands (SCJ, Style, Leaders, Bestie). Same chrome
// as the ecommerce Breakdown Explorer — channel tabs + dimension tabs (Campaign / Audience / Ad +
// demographics) + a Total row — but with KPI columns and goal coloring per profile.

type Profile = "views" | "leads";
interface Ch { id: "meta" | "google" | "tiktok"; label: string }

interface ViewsRow { key: string; spend: number; impressions: number; reach: number; frequency: number | null; cpm: number | null; views: number | null; completedViews: number | null; cpv: number | null }
interface LeadsRow { key: string; spend: number; impressions: number; clicks: number; ctr: number | null; cpc: number | null; leads: number | null; cpl: number | null }
type Row = ViewsRow | LeadsRow;

const cpm = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(1)}`);
const cpv = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(3)}`);
const freq = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const sum = <T,>(a: T[], f: (t: T) => number) => a.reduce((s, t) => s + (f(t) || 0), 0);
const DIV = "border-l border-[var(--card-border)]";

// Lower-is-better goal coloring (CPV / CPL) against the brand target.
function goalTone(v: number | null, target: number | null): string {
  if (v == null || !target) return "text-[var(--foreground)]";
  if (v <= target) return "text-[var(--good)]";
  if (v <= target * 1.3) return "text-[var(--warn)]";
  return "text-[var(--bad)]";
}

export default function CampaignExplorer({
  brandId,
  from,
  to,
  profile,
  channels,
  target,
}: {
  brandId: string;
  from: string;
  to: string;
  profile: Profile;
  channels: Ch[];
  target: number | null;
}) {
  const [channel, setChannel] = useState<Ch["id"]>(channels[0]?.id ?? "meta");
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const dims = Object.keys(DIMENSION_FIELDS[channel]) as Dimension[];

  useEffect(() => {
    const d = dims.includes(dimension) ? dimension : dims[0];
    if (d !== dimension) {
      setDimension(d);
      return;
    }
    let cancelled = false;
    const load = (spin: boolean) => {
      if (spin) setLoading(true);
      setErr("");
      setNote("");
      fetch(`/api/breakdown?brand=${brandId}&channel=${channel}&dimension=${d}&from=${from}&to=${to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          setRows(j.rows ?? []);
          setNote(j.note ?? "");
          setSortCol("spend");
          setSortDir("desc");
          if (j.error && (!j.rows || !j.rows.length)) setErr(j.error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, channel, dimension, from, to]);

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  const toggleSort = (col: string) => {
    if (col === sortCol) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortedRows = [...rows].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortCol];
    const bv = (b as unknown as Record<string, unknown>)[sortCol];
    if (typeof av === "string" || typeof bv === "string") {
      const r = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "desc" ? -r : r;
    }
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return sortDir === "desc" ? bn - an : an - bn;
  });
  const Th = (label: string, col: string, align: "left" | "right" = "right", extra = "") => (
    <th onClick={() => toggleSort(col)} className={`px-2 py-1.5 text-${align} cursor-pointer select-none hover:text-[var(--foreground)] ${col === sortCol ? "text-[var(--foreground)]" : ""} ${extra}`}>
      {label}{col === sortCol ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  // Totals for the banner + Total row.
  const tSpend = sum(rows, (r) => r.spend);
  const tImpr = sum(rows, (r) => r.impressions);

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Breakdown explorer</div>
        {target ? (
          <div className="text-[11px] text-[var(--muted)]">
            יעד {profile === "views" ? "CPV" : "CPL"} <span className="font-semibold text-[var(--foreground)]">{profile === "views" ? cpv(target) : formatIls(target)}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {channels.map((c) => (
            <button key={c.id} onClick={() => setChannel(c.id)} className={pill(channel === c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {dims.map((d) => (
            <button key={d} onClick={() => setDimension(d)} className={pill(dimension === d)}>{DIMENSION_LABELS[d]}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        {loading && rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">Loading…</div>
        ) : err ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">{err === "unsupported" ? "לא זמין לערוץ/דימנשן הזה." : err}</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">אין נתונים לטווח הזה.</div>
        ) : profile === "views" ? (
          <>
          {note ? <div className="mb-2 text-xs text-[var(--warn)]">{note}</div> : null}
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {Th(DIMENSION_LABELS[dimension], "key", "left")}
                {Th("Spend", "spend")}
                {Th("Impr", "impressions")}
                {Th("Reach", "reach")}
                {Th("Freq", "frequency")}
                {Th("CPM", "cpm")}
                {Th("Views", "views", "right", DIV)}
                {Th("100%", "completedViews")}
                {Th("CPV", "cpv")}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(sortedRows as ViewsRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[240px] truncate px-2 py-1.5 text-left font-medium" title={r.key} dir="auto">{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.reach)}</td>
                  <td className="px-2 py-1.5 text-right">{freq(r.frequency)}</td>
                  <td className="px-2 py-1.5 text-right">{cpm(r.cpm)}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${DIV}`}>{formatNumber(r.views)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.completedViews)}</td>
                  <td className={`px-2 py-1.5 text-right ${goalTone(r.cpv, target)}`}>{cpv(r.cpv)}</td>
                </tr>
              ))}
              {(() => {
                const s = rows as ViewsRow[];
                const reach = sum(s, (r) => r.reach);
                const views = sum(s, (r) => r.views ?? 0);
                const spend = tSpend;
                return (
                  <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                    <td className="px-2 py-1.5 text-left">Total</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(tImpr)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(reach)}</td>
                    <td className="px-2 py-1.5 text-right">{freq(reach ? tImpr / reach : null)}</td>
                    <td className="px-2 py-1.5 text-right">{cpm(tImpr ? (spend / tImpr) * 1000 : null)}</td>
                    <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(views)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(sum(s, (r) => r.completedViews ?? 0))}</td>
                    <td className={`px-2 py-1.5 text-right ${goalTone(views ? spend / views : null, target)}`}>{cpv(views ? spend / views : null)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          </>
        ) : (
          <>
          {note ? <div className="mb-2 text-xs text-[var(--warn)]">{note}</div> : null}
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {Th(DIMENSION_LABELS[dimension], "key", "left")}
                {Th("Spend", "spend")}
                {Th("Impr", "impressions")}
                {Th("Clicks", "clicks")}
                {Th("CTR", "ctr")}
                {Th("CPC", "cpc")}
                {Th("Leads", "leads", "right", DIV)}
                {Th("CPL", "cpl")}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(sortedRows as LeadsRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-left font-medium" title={r.key} dir="auto">{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.clicks)}</td>
                  <td className="px-2 py-1.5 text-right">{formatPct(r.ctr)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.cpc)}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${DIV}`}>{formatNumber(r.leads)}</td>
                  <td className={`px-2 py-1.5 text-right ${goalTone(r.cpl, target)}`}>{formatIls(r.cpl)}</td>
                </tr>
              ))}
              {(() => {
                const s = rows as LeadsRow[];
                const clicks = sum(s, (r) => r.clicks);
                const leads = sum(s, (r) => r.leads ?? 0);
                const spend = tSpend;
                return (
                  <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                    <td className="px-2 py-1.5 text-left">Total</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(tImpr)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(clicks)}</td>
                    <td className="px-2 py-1.5 text-right">{formatPct(tImpr ? clicks / tImpr : null)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(clicks ? spend / clicks : null)}</td>
                    <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(leads)}</td>
                    <td className={`px-2 py-1.5 text-right ${goalTone(leads ? spend / leads : null, target)}`}>{formatIls(leads ? spend / leads : null)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        חי מ-Windsor · לחיצה על כותרת ממיינת · {profile === "views" ? "Meta Views = ThruPlay · TikTok Views = 2s+ (100% = 6s+)" : "Meta = לידים · Google = conversions"} · צביעה מול היעד.
      </p>
    </div>
  );
}
