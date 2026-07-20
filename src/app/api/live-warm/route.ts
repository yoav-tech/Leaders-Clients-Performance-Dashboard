import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { getBrand } from "@/lib/brands";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Windsor can be slow; runs in the background, not on page render

// On-demand "live today": re-ingest TODAY for the viewed brand into the shared tables, so the
// next render (any serverless instance) reads fresh current-day numbers. Session-gated by
// middleware; the client calls it after first paint, then router.refresh()es.
export async function GET(request: Request) {
  const brand = new URL(request.url).searchParams.get("brand") ?? "";
  if (!getBrand(brand)) {
    return NextResponse.json({ ok: false, error: "unknown brand" }, { status: 400 });
  }
  try {
    const t = today();
    const result = await runIngest({ from: t, to: t, brandId: brand });
    return NextResponse.json({ ok: result.ok, upserts: result.upserts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
