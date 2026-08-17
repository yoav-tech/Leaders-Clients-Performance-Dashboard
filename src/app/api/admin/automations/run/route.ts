import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { isOwner, automationByKey } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { key } — trigger an automation now. Super-admin (owner) only. Calls the cron endpoint on
// THIS origin with the CRON_SECRET + force=1 (bypass the hour gate) + manual=1 (bypass the on/off
// gate), so a disabled automation can still be run manually.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await getServerSession();
  if (!(await isOwner(session))) return NextResponse.json({ error: "forbidden — owner only" }, { status: 403 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 400 });
  const b = await request.json().catch(() => ({}));
  const a = automationByKey(String(b.key ?? ""));
  if (!a) return NextResponse.json({ error: "unknown automation" }, { status: 400 });
  try {
    const origin = new URL(request.url).origin;
    const target = `${origin}${a.path}?secret=${encodeURIComponent(secret)}&force=1&manual=1`;
    const r = await fetch(target, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
    const result = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: r.ok, status: r.status, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
