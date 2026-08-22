import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverSession";
import { getBrand } from "@/lib/brands";
import { metaAdsConfigured, metaInsights, metaListAccounts, metaAction } from "@/lib/metaAds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only sanity check for the direct Meta Marketing API (System User token).
//   /api/admin/meta-test                 → is the token configured + which ad accounts can it see?
//   /api/admin/meta-test?brand=haat      → last-30d account insights for that brand's Meta account
//   /api/admin/meta-test?account=<id>    → last-30d account insights for a raw account id
export async function GET(request: Request) {
  const session = await getServerSession();
  if (session?.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!metaAdsConfigured()) return NextResponse.json({ ok: false, error: "META_ACCESS_TOKEN not set" }, { status: 503 });

  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand");
  const account = brandId ? getBrand(brandId)?.metaAccountId ?? "" : url.searchParams.get("account") ?? "";

  try {
    // No target account → list what the token can see (proves ads_read + account assignment).
    if (!account) {
      const accounts = await metaListAccounts();
      return NextResponse.json({ ok: true, configured: true, visibleAccounts: accounts.length, accounts });
    }
    const until = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const rows = await metaInsights(account, { level: "account", since, until, fields: ["spend", "impressions", "clicks", "reach", "actions"] });
    const r = rows[0] ?? {};
    return NextResponse.json({
      ok: true,
      account,
      window: { since, until },
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
      leads: metaAction(r, "lead", "onsite_conversion.lead_grouped"),
      raw: r,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
