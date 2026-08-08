import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { sendManagerReports } from "@/lib/managerRun";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // per-brand: metrics + creatives + promos + an LLM call

// Weekly account-manager reports → sent Thursday morning (see vercel.json).
//   ?dry=1                       → build only, return a text preview (no send)
//   ?brand=<id>&to=<email>       → one-off test send of a single brand to an address
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/weekly");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const r = await sendManagerReports("week", {
      dry: sp.get("dry") === "1",
      onlyBrand: sp.get("brand") ?? undefined,
      overrideTo: sp.get("to") ?? undefined,
    });
    return NextResponse.json({ ok: true, period: "week", ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
