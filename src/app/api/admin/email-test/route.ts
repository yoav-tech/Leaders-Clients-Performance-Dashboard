import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/serverSession";
import { emailConfigured, verifyEmail, sendEmail, fromAddress } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET (admin-only) → verify the Google Workspace SMTP connection; if ?to= is given, also send a
// test email there. Lets the media manager confirm the email pipe before any content is built.
//   /api/admin/email-test                    → verify credentials only
//   /api/admin/email-test?to=you@ldrsgroup.com → verify + send a test message
export async function GET(request: Request) {
  const session = await getServerSession();
  if (session?.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!emailConfigured()) {
    return NextResponse.json({ ok: false, error: "SMTP not configured — set SMTP_USER and SMTP_PASS (Google app password)." }, { status: 400 });
  }
  const to = new URL(request.url).searchParams.get("to");
  try {
    await verifyEmail();
    if (to) {
      await sendEmail({
        to,
        subject: "Leaders Dashboard — email test ✅",
        html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#1a1d26">חיבור ה-SMTP עובד. נשלח מ-${fromAddress()}. — Leaders Dashboard</div>`,
        text: `SMTP connection works. Sent from ${fromAddress()}.`,
      });
    }
    return NextResponse.json({ ok: true, verified: true, from: fromAddress(), sent: !!to });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
