// Ad creative visuals (image / video) per ad, from Windsor. Meta exposes image_url +
// thumbnail_url (video cover); TikTok exposes image_url + video_url (playable) + video_thumbnail_url.
// Keyed by ad_name so it joins onto the breakdown explorer's "ad" dimension rows.
//
// These creative-field queries are SLOW (~60-90s) and the URLs are signed/expiring, so this is
// fetched lazily by the client (not on page render) and the assets are served through the
// first-party /api/creative-proxy (keeps the strict CSP intact).

import type { BrandConfig } from "./brands";
import { fetchWindsor, num, type WindsorRow } from "./windsor";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
const str = (v: unknown) => { const s = String(v ?? "").trim(); return s && s !== "null" ? s : ""; };

export interface AdCreative {
  platform: "meta" | "tiktok";
  thumb: string | null; // image to show (proxied client-side)
  video: string | null; // playable video url (TikTok only), or null
}

export type CreativeMap = Record<string, AdCreative>;

export async function getCreatives(
  brand: BrandConfig,
  channel: "meta" | "tiktok",
  from: string,
  to: string,
): Promise<CreativeMap> {
  const account = channel === "meta" ? brand.metaAccountId : brand.tiktokAccountId;
  if (!account) return {};
  const target = normId(account);

  const fields =
    channel === "meta"
      ? ["account_id", "ad_name", "image_url", "thumbnail_url", "impressions"]
      : ["account_id", "ad_name", "image_url", "video_url", "video_thumbnail_url", "impressions"];

  let rows: WindsorRow[] = [];
  try {
    rows = await fetchWindsor({
      connector: channel === "meta" ? "facebook" : "tiktok",
      fields,
      dateFrom: from,
      dateTo: to,
      accounts: [account],
      cacheSeconds: 900, // creatives are stable; cache 15 min so repeat views are instant
    });
  } catch {
    return {};
  }

  // One ad can appear in many rows (daily/placement splits). Keep the asset from the
  // highest-impression row per ad_name.
  const best = new Map<string, { impr: number; c: AdCreative }>();
  for (const r of rows) {
    if (normId(r.account_id) !== target) continue;
    const name = str(r.ad_name);
    if (!name) continue;

    const image = str(r.image_url);
    const thumb =
      channel === "meta"
        ? image || str(r.thumbnail_url)
        : str(r.video_thumbnail_url) || image;
    const video = channel === "tiktok" ? str(r.video_url) : "";
    if (!thumb && !video) continue;

    const impr = num(r.impressions);
    const prev = best.get(name);
    if (prev && prev.impr >= impr && (prev.c.thumb || prev.c.video)) continue;
    best.set(name, { impr, c: { platform: channel, thumb: thumb || null, video: video || null } });
  }

  const out: CreativeMap = {};
  for (const [name, v] of best) out[name] = v.c;
  return out;
}
