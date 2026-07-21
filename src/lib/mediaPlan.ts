// Plan-vs-execution for awareness (media-plan) brands like Style. Pulls live Windsor actuals
// for the flight window and compares to the planned media buy. Video KPIs: Meta returns
// thruplay as a nested action array; TikTok exposes scalar 2s/6s view counts.

import type { BrandConfig, MediaPlanLine } from "./brands";
import { fetchWindsor, num } from "./windsor";
import { today } from "./dates";

export interface PlatformExecution {
  platform: "meta" | "tiktok";
  plan: MediaPlanLine;
  actual: { spend: number; impressions: number; reach: number; views: number; thruplay: number };
}
export interface MediaPlanExecution {
  flightStart: string;
  flightEnd: string;
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  platforms: PlatformExecution[];
}

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
// Meta returns some fields as [{action_type, value}] arrays — sum the values.
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}
function daysInclusive(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) + 1;
}

export async function getMediaPlanExecution(brand: BrandConfig): Promise<MediaPlanExecution | null> {
  const mp = brand.mediaPlan;
  if (!mp) return null;
  const t = today();
  const asOf = t < mp.flightEnd ? t : mp.flightEnd;
  const from = mp.flightStart;
  const platforms: PlatformExecution[] = [];

  if (brand.metaAccountId) {
    const acc = normId(brand.metaAccountId);
    const a = { spend: 0, impressions: 0, reach: 0, views: 0, thruplay: 0 };
    try {
      const rows = await fetchWindsor({
        connector: "facebook",
        fields: ["account_id", "spend", "impressions", "reach", "video_thruplay_watched_actions"],
        dateFrom: from,
        dateTo: asOf,
        accounts: [brand.metaAccountId],
        cacheSeconds: 120,
      });
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        a.spend += num(r.spend);
        a.impressions += num(r.impressions);
        a.reach += num(r.reach);
        a.thruplay += sumAction(r.video_thruplay_watched_actions);
      }
    } catch {
      /* leave zeros */
    }
    platforms.push({ platform: "meta", plan: mp.meta, actual: a });
  }

  if (brand.tiktokAccountId) {
    const acc = normId(brand.tiktokAccountId);
    const a = { spend: 0, impressions: 0, reach: 0, views: 0, thruplay: 0 };
    try {
      const rows = await fetchWindsor({
        connector: "tiktok",
        fields: ["account_id", "spend", "impressions", "reach", "video_watched_2s", "video_watched_6s"],
        dateFrom: from,
        dateTo: asOf,
        accounts: [brand.tiktokAccountId],
        cacheSeconds: 120,
      });
      for (const r of rows) {
        if (normId(r.account_id) !== acc) continue;
        a.spend += num(r.spend);
        a.impressions += num(r.impressions);
        a.reach += num(r.reach);
        a.views += num(r.video_watched_2s);
        a.thruplay += num(r.video_watched_6s);
      }
    } catch {
      /* leave zeros */
    }
    platforms.push({ platform: "tiktok", plan: mp.tiktok, actual: a });
  }

  return {
    flightStart: mp.flightStart,
    flightEnd: mp.flightEnd,
    asOf,
    elapsedDays: daysInclusive(mp.flightStart, asOf),
    totalDays: daysInclusive(mp.flightStart, mp.flightEnd),
    platforms,
  };
}
