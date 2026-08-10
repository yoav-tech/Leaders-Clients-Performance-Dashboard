import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getCampaignPerf, getPerfSourceAt } from "@/lib/campaignPerf";
import { parseAdLevel } from "@/lib/adLevel";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Windsor is slow; runs client-side (non-blocking), not on page render

// GET /api/report/campaign-perf?brand=&from=&to=  (auth-gated by middleware)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  if (!canAccessBrand(await getServerSession(), brand.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const sourceParam = url.searchParams.get("source");
    if (sourceParam !== null) {
      const source = await getPerfSourceAt(brand, Number(sourceParam), from, to, parseAdLevel(url.searchParams.get("level")));
      return NextResponse.json({ source });
    }
    const report = await getCampaignPerf(brand, from, to, parseAdLevel(url.searchParams.get("level")));
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
