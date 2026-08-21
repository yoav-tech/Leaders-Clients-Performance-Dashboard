import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import type { Dimension } from "@/lib/breakdowns";
import { getBreakdownData } from "@/lib/breakdownData";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import type { Channel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Thin auth wrapper — the (user-agnostic) computation is cached in getBreakdownData so warm hits,
// tab switches, and other users of the same brand are instant instead of re-fetching Windsor/store.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const channel = url.searchParams.get("channel") as Channel;
  const dimension = url.searchParams.get("dimension") as Dimension;
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const source = url.searchParams.get("source") ?? "";

  if (!brand || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "bad params", rows: [] }, { status: 400 });
  }
  if (!canAccessBrand(await getServerSession(), brand.id)) {
    return NextResponse.json({ error: "forbidden", rows: [] }, { status: 403 });
  }

  try {
    const data = await getBreakdownData(brand.id, channel, dimension, from, to, source);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), rows: [] }, { status: 500 });
  }
}
