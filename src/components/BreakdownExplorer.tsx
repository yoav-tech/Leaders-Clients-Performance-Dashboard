"use client";

import { useEffect, useState } from "react";
import { dimensionsFor, DIMENSION_LABELS, type Dimension } from "@/lib/breakdowns";
import type { Channel } from "@/lib/types";
import { formatIls, formatNumber, formatPct, formatRoas, roasTone } from "@/lib/metrics";

const TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warn)]",
  bad: "text-[var(--bad)]",
  none: "text-[var(--muted)]",
};

interface AdRow {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number | null;
  revenue: number | null;
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

export default function BreakdownExplorer({
  brandId,
  from,
  to,
}: {
  brandId: string;
  from: string;
  to: string;
}) {
  const channels: { id: Channel; label: string }[] = [
    { id: "meta", label: "Meta" },
    { id: "google", label: "Google" },
    { id: "tiktok", label: "TikTok" },
    { id: "site", label: "Store" },
  ];

  const [channel, setChannel] = useState<Channel>("meta");
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [rows, setRows] = useState<(AdRow | StoreRow)[]>([]);
  const [kind, setKind] = useState<"ad" | "store">("ad");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const dims = dimensionsFor(channel);

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
    fetch(`/api/breakdown?brand=${brandId}&channel=${channel}&dimension=${d}&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRows(j.rows ?? []);
        setKind(j.kind ?? "ad");
        setNote(j.note ?? "");
        if (j.error && (!j.rows || !j.rows.length)) setErr(j.error);
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, channel, dimension, from, to]);

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
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
                <th className="px-2 py-1.5 text-left">Discount code</th>
                <th className="px-2 py-1.5 text-right">Orders</th>
                <th className="px-2 py-1.5 text-right">Revenue</th>
                <th className="px-2 py-1.5 text-right">Discount</th>
                <th className="px-2 py-1.5 text-right">AOV</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(rows as StoreRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-left font-medium">{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.orders)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.revenue)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--muted)]">{formatIls(r.discount)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.aov)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
          {note ? (
            <div className="mb-2 text-xs text-[var(--warn)]">{note}</div>
          ) : null}
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-left">{DIMENSION_LABELS[dimension]}</th>
                <th className="px-2 py-1.5 text-right">Spend</th>
                <th className="px-2 py-1.5 text-right">Impr</th>
                <th className="px-2 py-1.5 text-right">Clicks</th>
                <th className="px-2 py-1.5 text-right">CTR</th>
                <th className="px-2 py-1.5 text-right">CPC</th>
                <th className="px-2 py-1.5 text-right">Purch</th>
                <th className="px-2 py-1.5 text-right">Revenue</th>
                <th className="px-2 py-1.5 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(rows as AdRow[]).map((r) => (
                <tr key={r.key} className="border-t border-[var(--card-border)]">
                  <td className="max-w-[220px] truncate px-2 py-1.5 text-left font-medium" title={r.key}>{r.key}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.spend)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.impressions)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.clicks)}</td>
                  <td className="px-2 py-1.5 text-right">{formatPct(r.ctr)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.cpc)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(r.purchases)}</td>
                  <td className="px-2 py-1.5 text-right">{formatIls(r.revenue)}</td>
                  <td className={`px-2 py-1.5 text-right ${TONE[roasTone(r.roas, 3)]}`}>{formatRoas(r.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
    </div>
  );
}
