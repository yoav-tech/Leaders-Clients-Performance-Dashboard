import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cronAuth";
import { buildReminderEmail } from "@/lib/emailDigest";
import { emailConfigured, sendEmail } from "@/lib/email";
import { mediaManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Monthly client-report reminder → media managers. Scheduled on the 1st (vercel.json: 0 7,8 1 * *)
// and actually sent once at 10:00 Israel time — so it fires reliably even when the 1st is Fri/Sat
// (the daily digest, which carries the weekly reminder, doesn't run then).
//   ?kind=week|month (default month) · ?force=1 bypasses the hour gate · ?dry=1 previews, no send.
export async function GET(request: Request) {
  const denied = await requireCron(request, "cron/report-reminder");
  if (denied) return denied;

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const kind = url.searchParams.get("kind") === "week" ? "week" : "month";

  if (!force) {
    const israelHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).formatToParts(new Date()).find((p) => p.type === "hour")?.value);
    if (israelHour !== 10) return NextResponse.json({ ok: true, skipped: `israel hour ${israelHour} ≠ 10` });
  }

  try {
    const { subject, html, text } = buildReminderEmail(kind);
    let emailed: string[] = [];
    const to = mediaManagers();
    if (!dry && emailConfigured() && to.length) {
      await sendEmail({ to, subject, html, text });
      emailed = to;
    }
    return NextResponse.json({ ok: true, kind, emailed, preview: text });
  } catch (e) {
    console.error("[cron/report-reminder] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
