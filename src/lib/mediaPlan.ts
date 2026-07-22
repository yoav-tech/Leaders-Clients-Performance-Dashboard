// Plan-vs-execution for awareness (media-plan) brands like Style — split by campaign TYPE
// (influencers / UGC / reach). Pulls live Windsor actuals at ad level, classifies each ad by
// its campaign + ad-set + ad name, aggregates per type, and computes remaining budget and the
// daily spend needed to stay on pace (remaining ÷ days left).

import type { BrandConfig, MediaPlanLine, CampaignType } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { today } from "./dates";

export interface Actual {
  spend: number;
  impressions: number;
  reach: number;
  views: number;
  thruplay: number;
}
export interface LineExecution {
  line: MediaPlanLine;
  actual: Actual;
  remaining: number; // budget − spend (≥0)
  daysLeft: number;
  dailyNeeded: number; // remaining ÷ days left
}
export interface MediaPlanExecution {
  flightStart: string;
  flightEnd: string;
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  lines: LineExecution[];
}

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}
function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
}
// Reach (campaign) wins; then Influencer / UGC (ad-set or ad name).
function classify(...parts: unknown[]): CampaignType | null {
  const hay = parts.map((p) => String(p ?? "")).join(" ").toLowerCase();
  if (/reach|ריץ/.test(hay)) return "reach";
  if (/influencer|משפ/.test(hay)) return "influencers";
  if (/ugc/.test(hay)) return "ugc";
  return null;
}
const emptyActual = (): Actual => ({ spend: 0, impressions: 0, reach: 0, views: 0, thruplay: 0 });

export async function getMediaPlanExecution(brand: BrandConfig): Promise<MediaPlanExecution | null> {
  const mp = brand.mediaPlan;
  if (!mp) return null;
  const t = today();
  const asOf = t < mp.flightEnd ? t : mp.flightEnd;

  const byType: Record<"meta" | "tiktok", Map<CampaignType, Actual>> = { meta: new Map(), tiktok: new Map() };
  const add = (plat: "meta" | "tiktok", type: CampaignType, patch: Partial<Actual>) => {
    const a = byType[plat].get(type) ?? emptyActual();
    a.spend += patch.spend ?? 0;
    a.impressions += patch.impressions ?? 0;
    a.reach += patch.reach ?? 0;
    a.views += patch.views ?? 0;
    a.thruplay += patch.thruplay ?? 0;
    byType[plat].set(type, a);
  };

  // Meta — ad-level rows, classified by campaign/adset/ad name.
  if (brand.metaAccountId) {
    const acc = normId(brand.metaAccountId);
    try {
      const rows = await fetchWindsor({
        connector: "facebook",
        fields: ["account_id", "campaign", "adset_name", "ad_name", "spend", "impressions", "reach", "video_thruplay_watched_actions"],
        dateFrom: mp.flightStart,
        dateTo: asOf,
        accounts: [brand.metaAccountId],
        cacheSeconds: 60,
      });
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        const type = classify(r.campaign, r.adset_name, r.ad_name);
        if (!type) continue;
        add("meta", type, { spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), thruplay: sumAction(r.video_thruplay_watched_actions) });
      }
    } catch {
      /* leave empty */
    }
  }

  // TikTok — ad-level rows (adgroup unavailable), classified by campaign/ad name.
  if (brand.tiktokAccountId) {
    const acc = normId(brand.tiktokAccountId);
    try {
      const rows = await fetchWindsor({
        connector: "tiktok",
        fields: ["account_id", "campaign_name", "ad_name", "spend", "impressions", "reach", "video_watched_2s", "video_watched_6s"],
        dateFrom: mp.flightStart,
        dateTo: asOf,
        accounts: [brand.tiktokAccountId],
        cacheSeconds: 60,
      });
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        const type = classify(r.campaign_name, r.ad_name);
        if (!type) continue;
        add("tiktok", type, { spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), views: num(r.video_watched_2s), thruplay: num(r.video_watched_6s) });
      }
    } catch {
      /* leave empty */
    }
  }

  const lines: LineExecution[] = mp.lines.map((line) => {
    const actual = byType[line.platform].get(line.type) ?? emptyActual();
    const remaining = Math.max(0, line.budget - actual.spend);
    const daysLeft = t <= line.flightEnd ? daysInclusive(t, line.flightEnd) : 0;
    const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : remaining;
    return { line, actual, remaining, daysLeft, dailyNeeded };
  });

  return {
    flightStart: mp.flightStart,
    flightEnd: mp.flightEnd,
    asOf,
    elapsedDays: daysInclusive(mp.flightStart, asOf),
    totalDays: daysInclusive(mp.flightStart, mp.flightEnd),
    lines,
  };
}
