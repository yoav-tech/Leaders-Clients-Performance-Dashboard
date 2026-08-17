import { NextResponse } from "next/server";
import { safeEqual } from "./auth";
import { clientIp } from "./rateLimit";
import { automationEnabled } from "./automations";

// Shared CRON_SECRET gate for scheduled write endpoints. Returns null when authorized,
// otherwise the NextResponse to return. Accepts `Authorization: Bearer <secret>` (Vercel Cron)
// or `?secret=` (manual). Fails closed if CRON_SECRET is unset.
export async function requireCron(request: Request, label: string): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("secret") ??
    "";
  if (!(await safeEqual(provided, secret))) {
    console.warn(`[${label}] unauthorized attempt from ${clientIp(request)}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Owner toggled this automation off? Skip scheduled runs. `?manual=1` (owner "run now") bypasses.
  if (url.searchParams.get("manual") !== "1" && !(await automationEnabled(label))) {
    return NextResponse.json({ ok: true, skipped: "disabled by admin" });
  }
  return null;
}
