import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getAwarenessReport, getAwarenessSourceAt } from "@/lib/awarenessReport";
import { parseAdLevel } from "@/lib/adLevel";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Windsor is slow; this runs client-side (non-blocking), not on page render

// Session-gated by middleware. Returns the awareness report as JSON so the view can fetch it
// client-side (page renders instantly instead of blocking SSR on Windsor).
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
    // Single-source mode (per-table drill): ?source=<index>&level=<lvl> → just that source.
    const sourceParam = url.searchParams.get("source");
    if (sourceParam !== null) {
      const source = await getAwarenessSourceAt(brand, Number(sourceParam), from, to, parseAdLevel(url.searchParams.get("level")));
      return NextResponse.json({ source });
    }
    const report = await getAwarenessReport(brand, from, to, parseAdLevel(url.searchParams.get("level")));
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
