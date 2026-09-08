// Range-level awareness reporting for video/reach brands (SCJ).
//
// Why this exists rather than reading daily_metrics: reach is a count of unique people, so it
// cannot be summed across days. Doing that inflated SCJ's Meta reach from 2.0m to 5.5m and pushed
// frequency down to 1.05 on a campaign that had actually been seen 2.87 times per person. Every
// figure here is fetched for the whole range in one query, which is the only way the platform
// deduplicates it.
//
// Meta is additionally split by publisher_platform so Facebook and Instagram report separately,
// matching how the media plan is laid out.
import type { BrandConfig } from "./brands";
import { fetchWindsor, num } from "./windsor";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").replace(/-/g, "").trim();
const sumAction = (v: unknown): number => {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
};

export interface PlatformRow {
  key: string;
  label: string;
  spend: number;
  impressions: number;
  reach: number | null;       // null = the platform doesn't report deduplicated reach to us
  frequency: number | null;
  views3s: number | null;     // the hook
  views15s: number;           // ThruPlay (Meta) / 6s (TikTok) / TrueView (YouTube)
  cpv: number | null;         // cost per 15s view
}
export interface CreativeRow {
  platform: string;
  name: string;
  spend: number;
  impressions: number;
  views15s: number;
  cpv: number | null;
  previewUrl: string | null;
}
export interface AwarenessRangeReport {
  from: string;
  to: string;
  rows: PlatformRow[];
  totals: { spend: number; impressions: number; views3s: number; views15s: number; cpv: number | null; reachSum: number | null };
  creatives: CreativeRow[];
  targetCpv: number | null;
  reachNote: string[];
}

function previewUrl(ig: string, story: string): string | null {
  if (ig) return ig;
  if (story && story.includes("_")) {
    const [page, post] = story.split("_");
    if (page && post) return `https://www.facebook.com/${page}/posts/${post}`;
  }
  return null;
}

export async function getAwarenessRange(brand: BrandConfig, from: string, to: string): Promise<AwarenessRangeReport | null> {
  const srcs = brand.awarenessSources;
  if (!srcs?.length) return null;
  const filter = (brand.campaignFilter ?? "").toLowerCase();
  const meta = srcs.find((s) => s.platform === "meta");
  const tiktok = srcs.find((s) => s.platform === "tiktok");
  const google = srcs.find((s) => s.platform === "google");
  const usdIls = 3;
  const toIls = (v: number, cur: string) => (cur === "USD" ? v * usdIls : v);

  const rows: PlatformRow[] = [];
  const creatives: CreativeRow[] = [];
  const reachNote: string[] = [];

  const [metaPlat, metaAds, tkRows, tkAds, ggRows] = await Promise.all([
    meta ? fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "currency", "campaign", "publisher_platform", "spend", "impressions", "reach",
        "video_thruplay_watched_actions", "actions_video_view"],
      dateFrom: from, dateTo: to, accounts: [meta.account],
      options: { attribution_window: "7d_click,1d_view" }, cacheSeconds: 1800,
    }).catch(() => []) : Promise.resolve([]),
    meta ? fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "currency", "campaign", "ad_name", "spend", "impressions",
        "video_thruplay_watched_actions", "instagram_permalink_url", "effective_object_story_id"],
      dateFrom: from, dateTo: to, accounts: [meta.account],
      options: { attribution_window: "7d_click,1d_view" }, cacheSeconds: 1800,
    }).catch(() => []) : Promise.resolve([]),
    // Campaign grain only — adding ad_name splits the rows and reach stops being deduplicated
    // (it came back 1.05m instead of 642k that way).
    tiktok ? fetchWindsor({
      connector: "tiktok",
      fields: ["account_id", "currency", "campaign_name", "spend", "impressions", "reach",
        "video_watched_6s", "video_watched_2s"],
      dateFrom: from, dateTo: to, accounts: [tiktok.account], cacheSeconds: 1800,
    }).catch(() => []) : Promise.resolve([]),
    tiktok ? fetchWindsor({
      connector: "tiktok",
      fields: ["account_id", "currency", "campaign_name", "ad_name", "spend", "impressions", "video_watched_6s"],
      dateFrom: from, dateTo: to, accounts: [tiktok.account], cacheSeconds: 1800,
    }).catch(() => []) : Promise.resolve([]),
    google ? fetchWindsor({
      connector: "google_ads",
      fields: ["account_id", "currency", "campaign", "spend", "impressions",
        "video_views", "video_quartile_p75_rate"],
      dateFrom: from, dateTo: to, accounts: [google.account], cacheSeconds: 1800,
    }).catch(() => []) : Promise.resolve([]),
  ]);

  // ---- Meta, split Facebook vs Instagram ----
  if (meta) {
    const acc = normId(meta.account);
    const byPlat = new Map<string, { spend: number; impr: number; reach: number; v15: number; v3: number; cur: string }>();
    for (const r of metaPlat) {
      if (normId(r.account_id) !== acc) continue;
      if (filter && !String(r.campaign ?? "").toLowerCase().includes(filter)) continue;
      const plat = String(r.publisher_platform ?? "").toLowerCase() || "other";
      const e = byPlat.get(plat) ?? { spend: 0, impr: 0, reach: 0, v15: 0, v3: 0, cur: String(r.currency ?? brand.nativeCurrency).toUpperCase() };
      e.spend += num(r.spend); e.impr += num(r.impressions); e.reach += num(r.reach);
      e.v15 += sumAction(r.video_thruplay_watched_actions); e.v3 += sumAction(r.actions_video_view);
      byPlat.set(plat, e);
    }
    const LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger" };
    for (const [plat, e] of [...byPlat].sort((a, b) => b[1].impr - a[1].impr)) {
      if (e.impr <= 0) continue;
      const spend = toIls(e.spend, e.cur);
      rows.push({
        key: `meta:${plat}`, label: LABEL[plat] ?? plat,
        spend, impressions: e.impr,
        reach: e.reach || null,
        frequency: e.reach ? e.impr / e.reach : null,
        views3s: e.v3 || null, views15s: e.v15,
        cpv: e.v15 ? spend / e.v15 : null,
      });
    }
    if (byPlat.size > 1) {
      reachNote.push("Facebook and Instagram reach cannot be added together — the same person may be reached on both.");
    }

    // Top creatives on Meta.
    const adMap = new Map<string, { spend: number; impr: number; v15: number; best: number; ig: string; story: string; cur: string }>();
    for (const r of metaAds) {
      if (normId(r.account_id) !== acc) continue;
      if (filter && !String(r.campaign ?? "").toLowerCase().includes(filter)) continue;
      const name = String(r.ad_name ?? "").trim();
      if (!name) continue;
      const sp = num(r.spend);
      const e = adMap.get(name) ?? { spend: 0, impr: 0, v15: 0, best: -1, ig: "", story: "", cur: String(r.currency ?? brand.nativeCurrency).toUpperCase() };
      e.spend += sp; e.impr += num(r.impressions); e.v15 += sumAction(r.video_thruplay_watched_actions);
      if (sp > e.best) { e.best = sp; e.ig = String(r.instagram_permalink_url ?? ""); e.story = String(r.effective_object_story_id ?? ""); }
      adMap.set(name, e);
    }
    for (const [name, e] of adMap) {
      if (e.v15 <= 0) continue;
      const spend = toIls(e.spend, e.cur);
      creatives.push({ platform: "Meta", name, spend, impressions: e.impr, views15s: e.v15, cpv: e.v15 ? spend / e.v15 : null, previewUrl: previewUrl(e.ig, e.story) });
    }
  }

  // ---- TikTok ----
  if (tiktok) {
    const acc = normId(tiktok.account);
    let spend = 0, impr = 0, reach = 0, v6 = 0, v2 = 0, cur = brand.channelCurrency?.tiktok ?? (brand.nativeCurrency as string);
    const adMap = new Map<string, { spend: number; impr: number; v6: number }>();
    for (const r of tkRows) {
      if (normId(r.account_id) !== acc) continue;
      if (filter && !String(r.campaign_name ?? "").toLowerCase().includes(filter)) continue;
      if (r.currency) cur = String(r.currency).toUpperCase();
      spend += num(r.spend); impr += num(r.impressions); reach += num(r.reach);
      v6 += num(r.video_watched_6s); v2 += num(r.video_watched_2s);
    }
    for (const r of tkAds) {
      if (normId(r.account_id) !== acc) continue;
      if (filter && !String(r.campaign_name ?? "").toLowerCase().includes(filter)) continue;
      const name = String(r.ad_name ?? "").trim();
      if (!name) continue;
      const e = adMap.get(name) ?? { spend: 0, impr: 0, v6: 0 };
      e.spend += num(r.spend); e.impr += num(r.impressions); e.v6 += num(r.video_watched_6s);
      adMap.set(name, e);
    }
    if (impr > 0) {
      const sp = toIls(spend, cur);
      rows.push({
        key: "tiktok", label: "TikTok", spend: sp, impressions: impr,
        reach: reach || null, frequency: reach ? impr / reach : null,
        views3s: v2 || null, views15s: v6, cpv: v6 ? sp / v6 : null,
      });
      for (const [name, e] of adMap) {
        if (e.v6 <= 0) continue;
        const s2 = toIls(e.spend, cur);
        creatives.push({ platform: "TikTok", name, spend: s2, impressions: e.impr, views15s: e.v6, cpv: e.v6 ? s2 / e.v6 : null, previewUrl: null });
      }
    }
  }

  // ---- Google / YouTube ----
  if (google) {
    const acc = normId(google.account);
    let spend = 0, impr = 0, views = 0, cur = brand.nativeCurrency as string;
    for (const r of ggRows) {
      if (normId(r.account_id) !== acc) continue;
      if (filter && !String(r.campaign ?? "").toLowerCase().includes(filter)) continue;
      if (r.currency) cur = String(r.currency).toUpperCase();
      spend += num(r.spend); impr += num(r.impressions);
      views += num(r.video_views) || num(r.impressions) * num(r.video_quartile_p75_rate);
    }
    if (impr > 0) {
      const sp = toIls(spend, cur);
      // unique_users comes back as 0 for the whole range, so we report no reach rather than a
      // number we know to be wrong. Summing the daily values gave a frequency of 1.03, which is
      // not credible for a month-long campaign.
      rows.push({
        key: "google", label: "YouTube", spend: sp, impressions: impr,
        reach: null, frequency: null, views3s: null, views15s: views, cpv: views ? sp / views : null,
      });
      reachNote.push("YouTube reach is not reported by our data source, so it is shown as unavailable rather than estimated.");
    }
  }

  const totals = rows.reduce((a, r) => ({
    spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
    views3s: a.views3s + (r.views3s ?? 0), views15s: a.views15s + r.views15s,
    reachSum: a.reachSum + (r.reach ?? 0),
  }), { spend: 0, impressions: 0, views3s: 0, views15s: 0, reachSum: 0 });

  creatives.sort((a, b) => b.views15s - a.views15s);

  return {
    from, to, rows,
    totals: { ...totals, cpv: totals.views15s ? totals.spend / totals.views15s : null, reachSum: totals.reachSum || null },
    creatives: creatives.slice(0, 12),
    targetCpv: brand.targetCpv ?? null,
    reachNote,
  };
}
