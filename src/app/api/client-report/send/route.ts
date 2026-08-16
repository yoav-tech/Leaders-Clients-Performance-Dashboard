import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { getClientReport, type ClientReport } from "@/lib/clientReport";
import { getReportNote, markReportSent, type ReportPeriod } from "@/lib/clientReportStore";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { emailConfigured, sendEmail } from "@/lib/email";
import { mediaManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const parsePeriod = (v: unknown): ReportPeriod => (v === "week" || v === "month" ? v : "custom");
const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderEmail(r: ClientReport, note: string): string {
  const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  const row = (a: string, b: string) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26">${a}</td><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${b}</td></tr>`;
  const platforms = r.platforms.map((p) => row(esc(p.platform), `${ils(p.spend)} · ${ils(p.revenue)} · ROAS ${roas(p.roas)} · ${pct(p.cvr)} · ${ils(p.aov)}`)).join("");
  const ads = r.topAds.map((a, i) => row(`${i + 1}. ${esc(a.name)}`, `ROAS ${roas(a.roas)} · ${ils(a.revenue)}`)).join("");
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">דוח ביצועים · ${esc(r.brandName)} · ${r.from} – ${r.to}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס אתר <b style="color:#1a1d26">${roas(r.topLevel.siteRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס ממומן <b style="color:#1a1d26">${roas(r.topLevel.paidRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">אחוז המרה <b style="color:#1a1d26">${pct(r.topLevel.cvr)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הרשמות <b style="color:#1a1d26">${r.registrations.toLocaleString("en-US")}</b></span>
      </div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:6px 0">לפי פלטפורמה · Spend · Revenue · ROAS · CVR · AOV</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${platforms}</table>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px">5 מודעות מובילות ברואס</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${ads}</table>
      <div style="margin-top:16px;color:#6b7280;font-size:13px;line-height:1.6">${esc(r.summary)}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #ececf3;color:#6b7280;font-size:11px">Leaders · Powered by People</div>
  </div></body></html>`;
}

// POST /api/client-report/send  { brand, period, from, to }  — media managers only.
// DEMO: sends to the media managers (safe). In production this goes to the client's recipients.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!(session?.role === "admin" || session?.role === "manager")) {
    return NextResponse.json({ error: "forbidden — media managers only" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const from = String(body.from ?? ""), to = String(body.to ?? ""), period = parsePeriod(body.period);
  if (!from || !to) return NextResponse.json({ error: "missing range" }, { status: 400 });
  if (!emailConfigured()) return NextResponse.json({ error: "email not configured" }, { status: 400 });
  try {
    const [report, note] = await Promise.all([getClientReport(brand, from, to), getReportNote(brand.id, period, from, to)]);
    if (!report) return NextResponse.json({ error: "no report data" }, { status: 400 });
    const to_ = mediaManagers(); // DEMO recipients; swap for the client's emails in production
    await sendEmail({ to: to_, subject: `דוח ביצועים · ${report.brandName} · ${from} – ${to} (תצוגה)`, html: renderEmail(report, note.note), text: report.summary + (note.note ? `\n\n${note.note}` : "") });
    await markReportSent(brand.id, period, from, to);
    return NextResponse.json({ ok: true, sentTo: to_ });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
