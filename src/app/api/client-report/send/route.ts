import { NextResponse } from "next/server";
import { getBrand, campaignProfileOf, type BrandConfig } from "@/lib/brands";
import { getClientReport, periodLabel, type ClientReport } from "@/lib/clientReport";
import { getTopProducts } from "@/lib/topProducts";
import { renderEmail, renderLeadsEmail } from "@/lib/reportEmailExtra";
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
    const [report, products] = await Promise.all([
      getClientReport(brand, from, to),
      getTopProducts(brand, from, to).catch(() => null),
    ]);
    if (!report) return NextResponse.json({ error: "no report data" }, { status: 400 });
    const to_ = mediaManagers(); // DEMO recipients; swap for the client's emails in production
    await sendEmail({ to: to_, subject: `דוח ביצועים · ${report.brandName} · ${from} – ${to} (תצוגה)`, html: renderEmail(report, note.note, products), text: report.summary + (note.note ? `\n\n${note.note}` : "") });
    await markReportSent(brand.id, period, from, to);
    return NextResponse.json({ ok: true, sentTo: to_ });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
