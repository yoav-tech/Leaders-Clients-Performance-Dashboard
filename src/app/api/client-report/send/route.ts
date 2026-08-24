import { NextResponse } from "next/server";
import { getBrand, campaignProfileOf, type BrandConfig } from "@/lib/brands";
import { getClientReport, periodLabel, type ClientReport } from "@/lib/clientReport";
import { getCampaignBrandMetrics, type CampBrandMetrics } from "@/lib/campaignMetrics";
import { getReportNote, markReportSent, type ReportPeriod } from "@/lib/clientReportStore";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { emailConfigured, sendEmail } from "@/lib/email";
import { mediaManagers, brandClients } from "@/lib/recipients";

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
  // Per-platform as a real multi-column table (was one crammed cell). Numbers LTR, platform RTL.
  const pth = (t: string, right = false) => `<th style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 11px/1.2 ${F};color:#6b7280;text-align:${right ? "right" : "left"};white-space:nowrap"${right ? "" : ' dir="ltr"'}>${t}</th>`;
  const ptd = (t: string, b = false) => `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:${b ? 600 : 400} 13px/1.3 ${F};color:#1a1d26;text-align:left;white-space:nowrap" dir="ltr">${t}</td>`;
  const platforms =
    `<tr>${pth("פלטפורמה", true)}${pth("הוצאה")}${pth("הכנסות")}${pth("ROAS")}${pth("CVR")}${pth("AOV")}</tr>` +
    r.platforms.map((p) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:right;white-space:nowrap">${esc(p.platform)}</td>${ptd(ils(p.spend))}${ptd(ils(p.revenue), true)}${ptd(roas(p.roas))}${ptd(pct(p.cvr))}${ptd(ils(p.aov))}</tr>`).join("");
  const adName = (a: ClientReport["topAds"][number], i: number) =>
    a.previewUrl
      ? `${i + 1}. <a href="${esc(a.previewUrl)}" style="color:#4f46e5;text-decoration:none" target="_blank" rel="noopener">${esc(a.name)} ↗</a>`
      : `${i + 1}. ${esc(a.name)}`;
  const at = r.topAds.reduce((a, x) => ({ spend: a.spend + x.spend, metaRev: a.metaRev + x.revenue, storeRev: a.storeRev + (x.storeRevenue ?? 0) }), { spend: 0, metaRev: 0, storeRev: 0 });
  const adsTotal = r.topAds.length
    ? `<tr><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:right">סה״כ</td>${ptd(ils(at.spend), true)}${ptd(at.spend ? roas(at.metaRev / at.spend) : "—", true)}${ptd(at.storeRev ? ils(at.storeRev) : "—", true)}${ptd(at.spend && at.storeRev ? roas(at.storeRev / at.spend) : "—", true)}</tr>`
    : "";
  const ads =
    `<tr>${pth("מודעה", true)}${pth("הוצאה")}${pth("רואס מטא")}${pth("הכנסות חנות")}${pth("רואס חנות")}</tr>` +
    r.topAds.map((a, i) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26;text-align:right">${adName(a, i)}</td>${ptd(ils(a.spend))}${ptd(roas(a.roas))}${ptd(a.storeRevenue == null ? "—" : ils(a.storeRevenue), true)}${ptd(a.storeRoas == null ? "—" : roas(a.storeRoas), true)}</tr>`).join("") +
    adsTotal;
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">דוח ביצועים · ${esc(r.brandName)} · ${r.from} – ${r.to}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span style="padding:8px 12px;border:1px solid #d9d3f5;background:#f4f1ff;border-radius:999px;font-size:12px;color:#6b7280">הכנסות חנות <b style="color:#4f46e5">${ils(r.topLevel.storeRevenue)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הזמנות <b style="color:#1a1d26">${r.topLevel.orders.toLocaleString("en-US")}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הוצאה <b style="color:#1a1d26">${ils(r.topLevel.totalSpend)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס אתר <b style="color:#1a1d26">${roas(r.topLevel.siteRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס ממומן <b style="color:#1a1d26">${roas(r.topLevel.paidRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">אחוז המרה <b style="color:#1a1d26">${pct(r.topLevel.cvr)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הרשמות <b style="color:#1a1d26">${r.registrations.toLocaleString("en-US")}</b></span>
      </div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:6px 0">לפי פלטפורמה</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${platforms}</table>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px">${r.topAds.length || 5} מודעות מובילות ברואס</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${ads}</table>
      <div style="margin-top:16px;color:#6b7280;font-size:13px;line-height:1.6">${esc(r.summary)}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #ececf3;color:#6b7280;font-size:11px">Leaders · Powered by People</div>
  </div></body></html>`;
}

const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };
const cplv = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

// Leads/awareness brand (Leaders / Bestie) report email — per-platform spend/leads/CPL + note.
function renderLeadsEmail(brand: BrandConfig, m: CampBrandMetrics, note: string, from: string, to: string): string {
  const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  const t = m.total;
  const row = (a: string, b: string) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26">${a}</td><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${b}</td></tr>`;
  const rows = m.channels.filter((c) => c.channel !== "total").map((c) => row(esc(CH_LABEL[c.channel] ?? c.channel), `${ils(c.spend)} · ${n0(c.clicks)} קליקים · ${n0(c.leads)} לידים · CPL ${cplv(c.cpl)}`)).join("");
  const pill = (l: string, v: string) => `<span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">${l} <b style="color:#1a1d26">${v}</b></span>`;
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">דוח ביצועים · ${esc(brand.nameHe)} · ${esc(periodLabel(from, to))}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${pill("הוצאה", ils(t.spend))}${pill("לידים", n0(t.leads))}${pill("עלות לליד", cplv(t.cpl))}${pill("קליקים", n0(t.clicks))}</div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:6px 0">לפי פלטפורמה · הוצאה · קליקים · לידים · CPL</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
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
    const note = await getReportNote(brand.id, period, from, to);
    // Leads/awareness brand (Leaders / Bestie) → send the leads report to the client (CEO).
    if (campaignProfileOf(brand) === "leads") {
      const metrics = await getCampaignBrandMetrics(brand, from, to);
      const clients = await brandClients(brand.id);
      const to_ = clients.length ? clients : mediaManagers();
      await sendEmail({ to: to_, subject: `דוח ביצועים · ${brand.nameHe} · ${from} – ${to}`, html: renderLeadsEmail(brand, metrics, note.note, from, to), text: `דוח ${brand.nameHe} · ${from} – ${to}${note.note ? `\n\n${note.note}` : ""}` });
      await markReportSent(brand.id, period, from, to);
      return NextResponse.json({ ok: true, sentTo: to_ });
    }
    const report = await getClientReport(brand, from, to);
    if (!report) return NextResponse.json({ error: "no report data" }, { status: 400 });
    const to_ = mediaManagers(); // DEMO recipients; swap for the client's emails in production
    await sendEmail({ to: to_, subject: `דוח ביצועים · ${report.brandName} · ${from} – ${to} (תצוגה)`, html: renderEmail(report, note.note), text: report.summary + (note.note ? `\n\n${note.note}` : "") });
    await markReportSent(brand.id, period, from, to);
    return NextResponse.json({ ok: true, sentTo: to_ });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
