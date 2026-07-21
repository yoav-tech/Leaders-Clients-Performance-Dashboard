// Alert engine for the comms panel. Two sources:
//   - Performance/pacing anomalies from stored daily_metrics (reuses queries.ts/metrics.ts).
//   - Ad-health (delivery/policy/billing/active-no-spend) from a live Windsor status pull.
// Dedup is via the alerts_sent table so a standing condition isn't re-posted the same day.

import { getSupabase, hasDb } from "./db";
import { BRANDS, type BrandConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { getBrandMetrics, getBrandMonthSpend } from "./queries";
import { computePacing, deltaPct } from "./metrics";
import { monthProgress, shiftDate, today } from "./dates";
import type { BrandMetrics } from "./types";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  brandId: string;
  brandName: string;
  channel: string; // "meta" | "google" | "tiktok" | "total" | "site"
  type: string;
  severity: AlertSeverity;
  detail: string; // human-readable line
  key: string; // stable dedup key (includes the date so it re-alerts next day)
}

// --- Tunable thresholds ---
const ROAS_DROP_PCT = -30; // blended ROAS down >30% vs previous period
const CVR_DROP_PCT = -35;
const SPEND_JUMP_PCT = 60; // spend up/down >60%
const ZERO_CONV_MIN_SPEND = 150; // ILS: flag spend with no conversions above this
const PACE_OVER = 120; // pacePct — ahead of plan
const PACE_UNDER = 60; // behind plan

// ---------------------------------------------------------------------------
// Performance / pacing alerts — from stored aggregates.
// window = trailing `days` vs the equal prior period (getBrandMetrics.previous).
// ---------------------------------------------------------------------------
export async function performanceAlerts(days = 7): Promise<Alert[]> {
  const to = shiftDate(today(), -1); // last full day
  const from = shiftDate(to, -(days - 1));
  const metrics = await getBrandMetrics(from, to);
  const { elapsed, daysInMonth } = monthProgress();

  const out: Alert[] = [];
  for (const m of metrics) {
    const brand = BRANDS.find((b) => b.id === m.brandId);
    if (!brand || brand.mediaPlan) continue; // skip awareness (media-plan) brands
    const tag = `${to}:${m.brandId}`;
    const p = m.previous;

    // Blended ROAS drop
    const roasDelta = deltaPct(m.blendedRoas, p?.blendedRoas ?? null);
    if (roasDelta !== null && roasDelta <= ROAS_DROP_PCT && (p?.blendedRoas ?? 0) > 0) {
      out.push(mk(brand, "total", "roas_drop", "warning",
        `Blended ROAS ${fmt(m.blendedRoas)} — down ${Math.round(roasDelta)}% vs prior ${days}d`, tag));
    }
    // Ad CVR drop (purchases / clicks)
    const curCvr = m.total.cvr;
    const prevCvr = p && p.clicks ? p.purchases / p.clicks : null;
    const cvrDelta = deltaPct(curCvr, prevCvr);
    if (cvrDelta !== null && cvrDelta <= CVR_DROP_PCT && (prevCvr ?? 0) > 0) {
      out.push(mk(brand, "total", "cvr_drop", "warning",
        `Ad CVR ${pct(curCvr)} — down ${Math.round(cvrDelta)}% vs prior ${days}d`, tag));
    }
    // Spend spike/drop
    const spendDelta = deltaPct(m.total.spend, p?.spend ?? null);
    if (spendDelta !== null && Math.abs(spendDelta) >= SPEND_JUMP_PCT && (p?.spend ?? 0) > 0) {
      const dir = spendDelta > 0 ? "up" : "down";
      out.push(mk(brand, "total", "spend_jump", "info",
        `Spend ${dir} ${Math.abs(Math.round(spendDelta))}% (${ilsN(m.total.spend)}) vs prior ${days}d`, tag));
    }
    // Zero conversions with meaningful spend (per ad channel)
    for (const ch of ["google", "meta", "tiktok"] as const) {
      const c = m.channels[ch];
      if (c.spend >= ZERO_CONV_MIN_SPEND && c.purchases === 0) {
        out.push(mk(brand, ch, "zero_conversions", "critical",
          `${label(ch)}: ${ilsN(c.spend)} spent, 0 conversions (last ${days}d)`, tag));
      }
    }

    // Pacing (MTD)
    if (brand.monthlyBudget > 0) {
      const monthSpend = await getBrandMonthSpend(brand.id);
      const pace = computePacing(brand.monthlyBudget, monthSpend, elapsed, daysInMonth);
      if (pace.pacePct !== null && pace.pacePct >= PACE_OVER) {
        out.push(mk(brand, "total", "pace_over", "warning",
          `Pacing ${Math.round(pace.pacePct)}% of plan — projected ${ilsN(pace.projected)} vs ${ilsN(brand.monthlyBudget)} budget`, `${monthTag()}:${m.brandId}`));
      } else if (pace.pacePct !== null && pace.pacePct <= PACE_UNDER) {
        out.push(mk(brand, "total", "pace_under", "info",
          `Pacing ${Math.round(pace.pacePct)}% of plan — underspending vs ${ilsN(brand.monthlyBudget)} budget`, `${monthTag()}:${m.brandId}`));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ad-health alerts — live Windsor status pull for the last full day.
// ---------------------------------------------------------------------------
type HealthCfg = {
  connector: string;
  statusField: string;
  nameField: string;
  active: string[];
  disapproved: string[];
  billing: string[];
  options?: Record<string, string>;
};
const HEALTH: Record<"meta" | "google" | "tiktok", HealthCfg> = {
  meta: {
    connector: "facebook",
    statusField: "effective_status",
    nameField: "ad_name",
    active: ["ACTIVE"],
    disapproved: ["DISAPPROVED", "WITH_ISSUES", "AD_PAUSED_WITH_ISSUES"],
    billing: ["PENDING_BILLING_INFO"],
    options: { attribution_window: "7d_click,1d_view" },
  },
  google: {
    connector: "google_ads",
    statusField: "ad_group_ad_status",
    nameField: "campaign_name",
    active: ["ENABLED"],
    disapproved: [],
    billing: [],
  },
  tiktok: {
    connector: "tiktok",
    statusField: "ad_status",
    nameField: "ad_name",
    active: ["AD_STATUS_DELIVERY_OK"],
    disapproved: ["AD_STATUS_REJECT", "AD_STATUS_AUDIT_DENY", "AD_STATUS_DISABLE"],
    billing: [],
  },
};

function accountFor(brand: BrandConfig, ch: "meta" | "google" | "tiktok"): string | null {
  return ch === "meta" ? brand.metaAccountId : ch === "google" ? brand.googleAccountId : brand.tiktokAccountId;
}
const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();

export async function adHealthAlerts(): Promise<Alert[]> {
  const day = shiftDate(today(), -1);
  const out: Alert[] = [];
  for (const brand of BRANDS) {
    if (brand.mediaPlan) continue; // awareness brands: no conversion alerts
    for (const ch of ["meta", "google", "tiktok"] as const) {
      const account = accountFor(brand, ch);
      if (!account) continue;
      const cfg = HEALTH[ch];
      let rows;
      try {
        rows = await fetchWindsor({
          connector: cfg.connector,
          fields: ["account_id", cfg.nameField, cfg.statusField, "spend"],
          dateFrom: day,
          dateTo: day,
          accounts: [account],
          options: cfg.options,
          cacheSeconds: 600,
        });
      } catch {
        continue; // don't let one channel's failure block the rest
      }
      // Aggregate spend + status per entity name.
      const byName = new Map<string, { status: string; spend: number }>();
      for (const r of rows) {
        if (normId(r.account_id) !== normId(account)) continue;
        const name = String(r[cfg.nameField] ?? "(unnamed)") || "(unnamed)";
        const status = String(r[cfg.statusField] ?? "").toUpperCase();
        const e = byName.get(name) ?? { status, spend: 0 };
        e.spend += num(r.spend);
        if (status) e.status = status;
        byName.set(name, e);
      }
      const tag = `${day}:${brand.id}:${ch}`;
      for (const [name, e] of byName) {
        if (cfg.disapproved.includes(e.status)) {
          out.push(mk(brand, ch, "policy", "critical", `${label(ch)}: "${name}" — ${statusText(e.status)}`, `${tag}:policy:${name}`));
        } else if (cfg.billing.includes(e.status)) {
          out.push(mk(brand, ch, "billing", "critical", `${label(ch)}: "${name}" — billing/payment issue (${e.status})`, `${tag}:billing:${name}`));
        } else if (cfg.active.includes(e.status) && e.spend === 0) {
          out.push(mk(brand, ch, "active_no_spend", "warning", `${label(ch)}: "${name}" active but spent ₪0 yesterday`, `${tag}:nospend:${name}`));
        }
      }
      // Account-level status (Meta exposes account_status).
      if (ch === "meta") {
        try {
          const acc = await fetchWindsor({ connector: "facebook", fields: ["account_id", "account_status"], dateFrom: day, dateTo: day, accounts: [account], cacheSeconds: 600 });
          const st = String(acc.find((r) => normId(r.account_id) === normId(account))?.account_status ?? "").toUpperCase();
          if (st && st !== "ACTIVE") {
            out.push(mk(brand, "meta", "account", "critical", `Meta ad account status: ${st} (check billing/disable)`, `${day}:${brand.id}:meta:account`));
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dedup against alerts_sent.
// ---------------------------------------------------------------------------
export async function filterUnsent(alerts: Alert[]): Promise<Alert[]> {
  if (!hasDb() || alerts.length === 0) return alerts;
  const sb = getSupabase();
  const keys = alerts.map((a) => a.key);
  const seen = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const { data } = await sb.from("alerts_sent").select("alert_key").in("alert_key", chunk);
    for (const r of data ?? []) seen.add(r.alert_key as string);
  }
  return alerts.filter((a) => !seen.has(a.key));
}

export async function recordSent(alerts: Alert[]): Promise<void> {
  if (!hasDb() || alerts.length === 0) return;
  const sb = getSupabase();
  const rows = alerts.map((a) => ({ brand_id: a.brandId, alert_key: a.key }));
  await sb.from("alerts_sent").upsert(rows, { onConflict: "brand_id,alert_key", ignoreDuplicates: true });
}

// Collect every alert (performance + ad-health), newest conditions only.
export async function collectAlerts(): Promise<Alert[]> {
  const [perf, health] = await Promise.all([
    performanceAlerts().catch(() => [] as Alert[]),
    adHealthAlerts().catch(() => [] as Alert[]),
  ]);
  const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return [...perf, ...health].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

// --- helpers ---
function mk(brand: BrandConfig, channel: string, type: string, severity: AlertSeverity, detail: string, key: string): Alert {
  return { brandId: brand.id, brandName: brand.name, channel, type, severity, detail, key: `${type}:${key}` };
}
function label(ch: string): string {
  return ch === "meta" ? "Meta" : ch === "google" ? "Google" : ch === "tiktok" ? "TikTok" : ch;
}
function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(1);
}
function ilsN(v: number): string {
  return `₪${Math.round(v).toLocaleString("en-US")}`;
}
function statusText(status: string): string {
  const map: Record<string, string> = {
    DISAPPROVED: "disapproved (policy)",
    WITH_ISSUES: "has delivery issues",
    AD_PAUSED_WITH_ISSUES: "paused with issues",
    AD_STATUS_DISABLE: "disabled",
    AD_STATUS_REJECT: "rejected",
    AD_STATUS_AUDIT_DENY: "rejected in review",
  };
  return map[status] ?? status.replace(/^AD_STATUS_/, "").replace(/_/g, " ").toLowerCase();
}
function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}
function monthTag(): string {
  return monthProgress().monthStart.slice(0, 7);
}

// Re-export for callers that only need the metrics type.
export type { BrandMetrics };
