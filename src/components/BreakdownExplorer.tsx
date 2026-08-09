"use client";

import { useEffect, useState } from "react";
import { dimensionsFor, DIMENSION_LABELS, type Dimension } from "@/lib/breakdowns";
import type { Channel } from "@/lib/types";
import type { AdCreative, CreativeMap } from "@/lib/creatives";
import { formatIls, formatNumber, formatPct, formatRoas, roasTone } from "@/lib/metrics";

// creatives arrive from /api/creatives as ready signed first-party /api/creative-proxy paths
// (keeps the strict self-only CSP intact); the client uses thumb/video verbatim.

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};
const DIV = "border-l border-[var(--card-border)]"; // divider between traffic & store metrics
const sum = <T,>(a: T[], f: (t: T) => number) => a.reduce((s, t) => s + (f(t) || 0), 0);

interface AdRow {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number | null;
  revenue: number | null;
  aov: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
}
interface StoreRow {
  key: string;
  orders: number;
  revenue: number;
  discount: number;
  aov: number;
}

// Thumbnail cell for the per-ad view. Shows the creative image (proxied), a ▶ badge for TikTok
// video, a skeleton while loading, or an empty placeholder if the ad has no asset.
function ThumbCell({ cre, loading, title, onOpen }: { cre: AdCreative | undefined; loading: boolean; title: string; onOpen: (v: { title: string; creative: AdCreative }) => void }) {
  return (
    <td className="w-[48px] px-1 py-1">
      {cre?.thumb || cre?.video ? (
        <button
          type="button"
          onClick={() => onOpen({ title, creative: cre })}
          className="relative block h-10 w-10 overflow-hidden rounded border border-[var(--card-border)]"
          title={cre.video ? "נגן וידאו" : "הצג תמונה"}
        >
          {cre.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cre.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[var(--card-border)]/30 text-[10px] text-[var(--muted)]">🎬</span>
          )}
          {cre.video && <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[11px] text-white">▶</span>}
        </button>
      ) : loading ? (
        <div className="h-10 w-10 animate-pulse rounded bg-[var(--card-border)]" />
      ) : (
        <div className="h-10 w-10 rounded bg-[var(--card-border)]/20" />
      )}
    </td>
  );
}

export default function BreakdownExplorer({
  brandId,
  from,
  to,
  isClient = false,
}: {
  brandId: string;
  from: string;
  to: string;
  isClient?: boolean;
}) {
  // The Store channel exposes discount codes — hidden from external clients.
  const channels: { id: Channel; label: string }[] = [
    { id: "meta", label: "Meta" },
    { id: "google", label: "Google" },
    { id: "tiktok", label: "TikTok" },
    ...(isClient ? [] : [{ id: "site" as Channel, label: "Store" }]),
  ];

  const [channel, setChannel] = useState<Channel>("meta");
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [rows, setRows] = useState<(AdRow | StoreRow)[]>([]);
  const [kind, setKind] = useState<"ad" | "store">("ad");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [storeSummary, setStoreSummary] = useState<{ orders: number; revenue: number; spend: number; roas: number | null } | null>(null);
  const [storeAttributed, setStoreAttributed] = useState(false);
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [creatives, setCreatives] = useState<CreativeMap>({});
  const [creLoading, setCreLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ title: string; creative: AdCreative } | null>(null);
  const [sources, setSources] = useState<string[]>([]); // distinct utm_source for the store filter
  const [sourceFilter, setSourceFilter] = useState("");

  const dims = dimensionsFor(channel);
  // Creatives (ad visuals) are only fetched for the per-ad view on Meta/TikTok.
  const showThumb = dimension === "ad" && (channel === "meta" || channel === "tiktok");
  const isDiscount = dimension === "discount_code"; // store table shows the Discount column only here

  useEffect(() => {
    const d = dims.includes(dimension) ? dimension : dims[0];
    if (d !== dimension) {
      setDimension(d);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    setNote("");
    const srcQ = channel === "site" && sourceFilter ? `&source=${encodeURIComponent(sourceFilter)}` : "";
    fetch(`/api/breakdown?brand=${brandId}&channel=${channel}&dimension=${d}&from=${from}&to=${to}${srcQ}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRows(j.rows ?? []);
        setKind(j.kind ?? "ad");
        setNote(j.note ?? "");
        setStoreSummary(j.storeSummary ?? null);
        setStoreAttributed(!!j.storeAttributed);
        if (Array.isArray(j.sources)) setSources(j.sources);
        setSortCol(j.kind === "store" ? "revenue" : "spend");
        setSortDir("desc");
        if (j.error && (!j.rows || !j.rows.length)) setErr(j.error);
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, channel, dimension, from, to, sourceFilter]);

  // Lazily load ad creatives for the per-ad view (slow ~110s first time, then Windsor-cached).
  // Kept separate from the breakdown fetch so the table renders immediately and thumbs fill in.
  useEffect(() => {
    setCreatives({});
    if (!showThumb) return;
    let cancelled = false;
    setCreLoading(true);
    fetch(`/api/creatives?brand=${brandId}&channel=${channel}&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setCreatives(j.creatives ?? {}))
      .catch(() => !cancelled && setCreatives({}))
      .finally(() => !cancelled && setCreLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, channel, dimension, from, to, showThumb]);

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  const toggleSort = (col: string) => {
    if (col === sortCol) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
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
  // Sortable header cell. `align` left for the label column, right otherwise.
  const Th = (label: string, col: string, align: "left" | "right" = "right", extra = "") => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-2 py-1.5 text-${align} cursor-pointer select-none hover:text-[var(--foreground)] ${col === sortCol ? "text-[var(--foreground)]" : ""} ${extra}`}
    >
      {label}
      {col === sortCol ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">Breakdown explorer</div>

      <div className="flex flex-wrap gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {channels.map((c) => (
            <button key={c.id} onClick={() => setChannel(c.id)} className={pill(channel === c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--card-border)] p-1">
          {dims.map((d) => (
            <button key={d} onClick={() => setDimension(d)} className={pill(dimension === d)}>
              {DIMENSION_LABELS[d]}
            </button>
          ))}
        </div>
        {channel === "site" && !isDiscount && sources.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            מקור
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
            >
              <option value="">כל המקורות</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        {loading ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">Loading…</div>
        ) : err ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">
            {err === "unsupported" ? "Not available for this channel." : err}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--muted)]">No data for this range.</div>
        ) : kind === "store" ? (
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {Th(DIMENSION_LABELS[dimension], "key", "left")}
                {Th("Orders", "orders")}
                {Th("Revenue", "revenue")}
                {isDiscount && Th("Discount", "discount")}
                {Th("AOV", "aov")}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(sortedRows as StoreRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-left font-medium" title={r.key}>{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.orders)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.revenue)}</td>
                  {isDiscount && <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatIls(r.discount)}</td>}
                  <td className="px-2 py-1.5 text-right">{formatIls(r.aov)}</td>
                </tr>
              ))}
              {(() => {
                const s = rows as StoreRow[];
                const orders = sum(s, (r) => r.orders);
                const revenue = sum(s, (r) => r.revenue);
                const discount = sum(s, (r) => r.discount);
                return (
                  <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                    <td className="px-2 py-1.5 text-left">Total</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(orders)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(revenue)}</td>
                    {isDiscount && <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatIls(discount)}</td>}
                    <td className="px-2 py-1.5 text-right">{formatIls(orders ? revenue / orders : null)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        ) : (
          <>
          {storeSummary ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/40 px-3 py-2 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Store total (UTM-attributed)</span>
              <span>עסקאות <span className="font-semibold">{formatNumber(storeSummary.orders)}</span></span>
              <span>הכנסות <span className="font-semibold">{formatIls(storeSummary.revenue)}</span></span>
              <span>רואס חנות <span className={`font-semibold ${TONE[roasTone(storeSummary.roas, 3)]}`}>{formatRoas(storeSummary.roas)}</span></span>
              <span className="text-[var(--muted)]">spend {formatIls(storeSummary.spend)}</span>
            </div>
          ) : null}
          {note ? (
            <div className="mb-2 text-xs text-[var(--warn)]">{note}</div>
          ) : null}
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {showThumb && <th className="px-1 py-1.5" />}
                {Th(DIMENSION_LABELS[dimension], "key", "left")}
                {Th("Spend", "spend")}
                {Th("Impr", "impressions")}
                {Th("Clicks", "clicks")}
                {Th("CTR", "ctr")}
                {Th("CPC", "cpc")}
                {Th("Purch", "purchases", "right", DIV)}
                {Th("Revenue", "revenue")}
                {Th("AOV", "aov")}
                {Th("ROAS", "roas")}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(sortedRows as AdRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  {showThumb && <ThumbCell cre={creatives[r.key]} loading={creLoading} title={r.key} onOpen={setLightbox} />}
                  <td className="max-w-[220px] truncate px-2 py-1.5 text-left font-medium" title={r.key}>{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.clicks)}</td>
                  <td className="px-2 py-1.5 text-right">{formatPct(r.ctr)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.cpc)}</td>
                  <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(r.purchases)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.revenue)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.aov)}</td>
                  <td className={`px-2 py-1.5 text-right ${TONE[roasTone(r.roas, 3)]}`}>{formatRoas(r.roas)}</td>
                </tr>
              ))}
              {(() => {
                const a = rows as AdRow[];
                const spend = sum(a, (r) => r.spend);
                const impressions = sum(a, (r) => r.impressions);
                const clicks = sum(a, (r) => r.clicks);
                const purchases = sum(a, (r) => r.purchases ?? 0);
                const revenue = sum(a, (r) => r.revenue ?? 0);
                return (
                  <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                    {showThumb && <td className="px-1 py-1.5" />}
                    <td className="px-2 py-1.5 text-left">Total</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(spend)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(impressions)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(clicks)}</td>
                    <td className="px-2 py-1.5 text-right">{formatPct(impressions ? clicks / impressions : null)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(clicks ? spend / clicks : null)}</td>
                    <td className={`px-2 py-1.5 text-right ${DIV}`}>{formatNumber(purchases)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(revenue)}</td>
                    <td className="px-2 py-1.5 text-right">{formatIls(purchases ? revenue / purchases : null)}</td>
                    <td className={`px-2 py-1.5 text-right ${TONE[roasTone(spend ? revenue / spend : null, 3)]}`}>{formatRoas(spend ? revenue / spend : null)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          {storeAttributed ? (
            <div className="mt-2 text-[11px] text-[var(--muted)]">Purch · Revenue · AOV · ROAS are <span className="text-[var(--foreground)]">store-attributed</span> per campaign (store utm_campaign → ad campaign). Spend · Impr · Clicks are platform-reported.</div>
          ) : null}
          {showThumb ? (
            <div className="mt-2 text-[11px] text-[var(--muted)]">
              {creLoading ? "טוען תמונות מודעה… (הפעם הראשונה בטווח איטית, אח״כ מהיר)" : "לחיצה על תמונה פותחת תצוגה מלאה · TikTok מנגן וידאו · המדיה מוגשת דרך שרת פנימי."}
            </div>
          ) : null}
          </>
        )}
      </div>

      {lightbox ? (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] max-w-[92vw] overflow-hidden rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <span className="truncate text-sm font-medium" dir="auto" title={lightbox.title}>{lightbox.title}</span>
              <button onClick={() => setLightbox(null)} className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            {lightbox.creative.video ? (
              <video
                src={lightbox.creative.video}
                poster={lightbox.creative.thumb ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-h-[80vh] max-w-[88vw] rounded"
              />
            ) : lightbox.creative.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightbox.creative.thumb} alt="" className="max-h-[80vh] max-w-[88vw] rounded object-contain" />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
