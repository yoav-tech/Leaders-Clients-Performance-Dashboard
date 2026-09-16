import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { getBrand } from "@/lib/brands";
import { getYouTubeVideoStats } from "@/lib/googleVideo";
import { googleAdsConfigured } from "@/lib/googleAds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/cron/gads-video?brand=chery&from=&to=
//
// Reads YouTube video metrics straight from the Google Ads API. It exists because the local
// toolchain can't run this check: `node --env-file` mis-parses the credentials pulled out of
// Vercel, so a local failure says nothing about whether the token works. Production is the only
// place the answer is real, so the check lives here.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/gads-video");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const brand = getBrand(sp.get("brand") ?? "");
  if (!brand?.googleAccountId) return NextResponse.json({ error: "brand has no Google account" }, { status: 400 });
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!from || !to) return NextResponse.json({ error: "missing from/to" }, { status: 400 });

  const stats = await getYouTubeVideoStats(brand.googleAccountId, from, to);
  if (!stats) {
    return NextResponse.json({
      ok: false,
      configured: googleAdsConfigured(),
      reason: googleAdsConfigured()
        ? "the API is configured but returned nothing — token rejected, no permission on this customer, or no data in range"
        : "GOOGLE_ADS_* env vars are not all set",
    });
  }

  const totals = stats.reduce((a, s) => ({
    cost: a.cost + s.cost, impressions: a.impressions + s.impressions, views: a.views + s.views,
    q25: a.q25 + s.q25, q50: a.q50 + s.q50, q75: a.q75 + s.q75, q100: a.q100 + s.q100,
  }), { cost: 0, impressions: 0, views: 0, q25: 0, q50: 0, q75: 0, q100: 0 });

  const round = (s: typeof totals) => ({
    cost: Math.round(s.cost), impressions: Math.round(s.impressions), views: Math.round(s.views),
    q25: Math.round(s.q25), q50: Math.round(s.q50), q75: Math.round(s.q75), q100: Math.round(s.q100),
    costPerView: s.views ? +(s.cost / s.views).toFixed(4) : null,
    costPerCompleted: s.q100 ? +(s.cost / s.q100).toFixed(4) : null,
  });

  return NextResponse.json({
    ok: true, brand: brand.id, customer: brand.googleAccountId, from, to,
    campaigns: stats.map((s) => ({ name: s.name, kind: s.kind, subType: s.subType, ...round(s) })),
    totals: round(totals),
  });
}
