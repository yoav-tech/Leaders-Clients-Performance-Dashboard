// Map a store order's first-party attribution (utm_source / utm_medium / referrer host) to
// one of our paid ad channels — or null for organic/direct/other (SMS, influencer, POS,
// organic search, direct). Used to build store-attributed channel funnels.
//
// Google is PAID-ONLY: utm_source "google"/"cpc" counts, but "google_organic" and a bare
// google.com referrer (no utm) are treated as organic → null.

import type { Channel } from "./types";

function host(u: string): string {
  try {
    return new URL(u).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function utmToChannel(
  utmSource?: string | null,
  _utmMedium?: string | null,
  referrer?: string | null,
): Channel | null {
  const s = (utmSource ?? "").trim().toLowerCase();
  const r = referrer ? host(referrer) : "";

  // --- Meta (Facebook + Instagram) ---
  if (/^(fb|facebook|ig|instagram|meta)(_|$)/.test(s)) return "meta";
  if (/(^|\.)(instagram|facebook)\.com$/.test(r) || /^(l|m|lm)\.(instagram|facebook)\.com$/.test(r) || r === "igrdr.com")
    return "meta";

  // --- TikTok ---
  if (/^(tiktok|tt)(_|$)/.test(s)) return "tiktok";
  if (/(^|\.)tiktok\.com$/.test(r)) return "tiktok";

  // --- Google (PAID only) ---
  if (s === "google_organic") return null; // explicitly organic
  if (s === "google" || s === "cpc" || s === "google_ads" || s === "adwords") return "google";
  // A bare google.com referrer with no paid utm is organic → excluded.

  // Everything else (sms, klaviyo, influencer handles, pos, direct, yahoo, coupons…) → not a paid channel.
  return null;
}
