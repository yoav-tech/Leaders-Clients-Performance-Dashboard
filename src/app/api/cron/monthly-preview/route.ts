import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { BRANDS, campaignProfileOf, reportGroupOf, getBrand } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getTopProducts } from "@/lib/topProducts";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import { getAppReport } from "@/lib/appReport";
import { getSearchSnapshot } from "@/lib/searchSnapshot";
import { HAAT_AUGUST_2026 } from "@/lib/haatRegions";
import { renderEmail, renderLeadsEmail, renderViewsEmail, renderAppEmail, renderImpShareEmail } from "@/lib/reportEmailExtra";
import { sendEmail, emailConfigured } from "@/lib/email";
import { mediaManagers } from "@/lib/recipients";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One monthly summary email per brand, for internal review. Always goes to the media managers —
// never to a client — so a month can be checked end to end before anything is sent outward.
// GET /api/cron/monthly-preview?from=2026-08-01&to=2026-08-31[&brand=argania]
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  if (!(await safeEqual(provided, secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ error: "email not configured" }, { status: 400 });

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!from || !to) return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  const only = url.searchParams.get("brand");
  const recipients = mediaManagers();

  const out: Record<string, string> = {};
  const targets = BRANDS.filter((b) => !b.retired && (!only || b.id === only));
  for (const b of targets) {
    try {
      const prof = campaignProfileOf(b);
      const grp = reportGroupOf(b);
      let html: string | null = null;

      if (grp === "ecommerce") {
        const [r, products] = await Promise.all([
          getClientReport(b, from, to),
          getTopProducts(b, from, to).catch(() => null),
        ]);
        if (r) html = renderEmail(r, "", products);
      } else if (prof === "leads") {
        const m = await getCampaignBrandMetrics(b, from, to);
        if (m && (m.total.spend > 0 || m.total.leads > 0)) html = renderLeadsEmail(b, m, "", from, to);
      } else if (prof === "app") {
        const r = await getAppReport(b, from, to);
        // The city table is the client's own registration count (their backend, not Meta's
        // attribution), so it only applies to the month it was compiled for.
        const cities = from.startsWith("2026-08") ? HAAT_AUGUST_2026.rows : undefined;
        if (r) html = renderAppEmail(b, r, "", from, to, cities);
      } else if (grp === "impshare") {
        const r = await getSearchSnapshot(b, from, to);
        if (r) html = renderImpShareEmail(b, r.sections, "", from, to);
      } else {
        const m = await getCampaignBrandMetrics(b, from, to);
        if (m && m.total.spend > 0) html = renderViewsEmail(b, m, "", from, to);
      }

      if (!html) { out[b.id] = "skipped — no data"; continue; }
      await sendEmail({ to: recipients, subject: `סיכום חודשי · ${b.nameHe} · ${from} – ${to}`, html });
      out[b.id] = "sent";
    } catch (e) {
      out[b.id] = `error: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    }
  }
  return NextResponse.json({ ok: true, from, to, sentTo: recipients, brands: out });
}
