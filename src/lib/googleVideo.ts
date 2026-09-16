// YouTube video metrics straight from the Google Ads API.
//
// Windsor's Google Ads connector returns the quartile RATES but not the view count: video_views,
// trueview_views and video_view_rate all come back as zero. So the dashboard had been deriving a
// "view" as impressions × the 75% quartile rate — a proxy, and a poor one, because a YouTube
// account usually mixes campaign types that behave nothing alike. On Chery it read 419,517 views
// where Google Ads itself reports 739,914.
//
// GAQL has the real metric. It also has the campaign's channel sub-type, which is what separates a
// Shorts campaign from in-stream — the distinction that matters most here: Chery's in-stream
// campaign delivers as many 100%-views as its Shorts campaign for an eighth of the money, and
// nothing shows that while the two are summed into one "YouTube" line.
import { gaql, googleAdsConfigured } from "./googleAds";

export interface YouTubeCampaignStats {
  name: string;
  /** VIDEO, DISPLAY, … */
  channelType: string;
  /** VIDEO_OUTSTREAM / VIDEO_NON_SKIPPABLE_IN_STREAM / … — null when Google doesn't set one. */
  subType: string | null;
  /** Our best label for what the campaign actually is. */
  kind: "shorts" | "in-stream" | "other";
  cost: number;         // account currency
  impressions: number;
  /** Google's own TrueView view count — the number in the Ads Manager "Views" column. */
  views: number;
  q25: number; q50: number; q75: number; q100: number;
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/** Shorts campaigns aren't flagged directly; Google models them as outstream/efficient-reach video. */
function classify(subType: string | null, name: string): YouTubeCampaignStats["kind"] {
  const s = (subType ?? "").toUpperCase();
  const nm = name.toLowerCase();
  if (s.includes("OUTSTREAM") || s.includes("REACH") || nm.includes("short")) return "shorts";
  if (s.includes("IN_STREAM") || s.includes("SEQUENCE") || s.includes("ACTION")) return "in-stream";
  return "other";
}

/**
 * Per-campaign video stats for one customer. Returns null when the API isn't configured or the
 * call fails — callers keep their existing quartile-derived path in that case, so a dead token
 * degrades the numbers rather than blanking the report.
 */
export async function getYouTubeVideoStats(
  customerId: string, from: string, to: string,
): Promise<YouTubeCampaignStats[] | null> {
  if (!googleAdsConfigured()) return null;
  try {
    const rows = await gaql(customerId, `
      SELECT campaign.name,
             campaign.advertising_channel_type,
             campaign.advertising_channel_sub_type,
             metrics.cost_micros,
             metrics.impressions,
             metrics.video_views,
             metrics.video_quartile_p25_rate,
             metrics.video_quartile_p50_rate,
             metrics.video_quartile_p75_rate,
             metrics.video_quartile_p100_rate
      FROM campaign
      WHERE segments.date BETWEEN '${from}' AND '${to}'
        AND metrics.impressions > 0`);

    // GAQL returns one row per campaign per segment; fold them together.
    const byName = new Map<string, YouTubeCampaignStats>();
    for (const r of rows) {
      const c = (r.campaign ?? {}) as Record<string, unknown>;
      const m = (r.metrics ?? {}) as Record<string, unknown>;
      const name = String(c.name ?? "").trim();
      if (!name) continue;
      const subType = c.advertisingChannelSubType ? String(c.advertisingChannelSubType) : null;
      const impr = n(m.impressions);
      const e = byName.get(name) ?? {
        name,
        channelType: String(c.advertisingChannelType ?? ""),
        subType,
        kind: classify(subType, name),
        cost: 0, impressions: 0, views: 0, q25: 0, q50: 0, q75: 0, q100: 0,
      };
      e.cost += n(m.costMicros) / 1e6;
      e.impressions += impr;
      e.views += n(m.videoViews);
      // Quartiles come back as rates; turn them into counts against the same row's impressions.
      e.q25 += impr * n(m.videoQuartileP25Rate);
      e.q50 += impr * n(m.videoQuartileP50Rate);
      e.q75 += impr * n(m.videoQuartileP75Rate);
      e.q100 += impr * n(m.videoQuartileP100Rate);
      byName.set(name, e);
    }
    const out = [...byName.values()].sort((a, b) => b.cost - a.cost);
    return out.length ? out : null;
  } catch {
    return null;
  }
}
