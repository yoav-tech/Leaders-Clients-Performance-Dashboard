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
import { getDraftedLines, learnFromSend } from "@/lib/insightLearning";
import { getInsightFeedback } from "@/lib/insightFeedbackStore";
import { buildEcomDraft } from "@/lib/ecomDraft";

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

    // Teach the engine from what actually went out. The manager already did the work of editing the
    // draft into what the client should read — diffing that against what was drafted is the whole
    // correction, with nothing asked of them. Strictly after the send, and never allowed to throw:
    // learning must not be able to fail a report that has already reached its recipients.
    let learned: unknown = null;
    try {
      if (note.note.trim()) {
        // Prefer the draft recorded when the manager generated it. When there isn't one — the
        // button wasn't pressed, or recording failed — rebuild it from the same inputs instead of
        // giving up. Learning was asked for as a mechanism that runs behind the scenes, so it must
        // not hinge on a button press or on a write having succeeded an hour earlier.
        let drafted = await getDraftedLines(brand.id, from, to);
        if (!drafted.length) drafted = (await buildEcomDraft(brand, from, to))?.lines ?? [];
        if (drafted.length) {
          learned = await learnFromSend(brand.id, drafted, note.note, session.sub ?? null, await getInsightFeedback(brand.id));
        }
      }
    } catch (e) {
      console.error("[client-report/send] learning failed:", e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({ ok: true, sentTo: to_, learned });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
