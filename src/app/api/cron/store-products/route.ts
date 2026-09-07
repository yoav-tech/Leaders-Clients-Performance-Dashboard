import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { BRANDS } from "@/lib/brands";
import { ingestStoreProducts } from "@/lib/storeProducts";
import { today, shiftDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily per-product sales for the store clients, so the report's "top products" covers whatever
// range the client is viewing. Re-ingests a trailing window rather than just yesterday, so orders
// that settle late (and refunds) correct themselves — the window is replaced, never added to.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days") ?? 4)));
  const to = url.searchParams.get("to") || today();
  const from = url.searchParams.get("from") || shiftDate(to, -(days - 1));
  const only = url.searchParams.get("brand");

  const targets = BRANDS.filter((b) => !b.retired && !!b.storePlatform && (!only || b.id === only));
  const out: Record<string, number | string> = {};
  for (const b of targets) {
    try {
      const { rows } = await ingestStoreProducts(b, from, to);
      out[b.id] = rows;
    } catch (e) {
      out[b.id] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return NextResponse.json({ ok: true, from, to, brands: out });
}
