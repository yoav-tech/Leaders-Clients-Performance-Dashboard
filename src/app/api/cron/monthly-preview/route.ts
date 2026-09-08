import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { BRANDS, campaignProfileOf, reportGroupOf, getBrand } from "@/lib/brands";
import { getClientReport } from "@/lib/clientReport";
import { getTopProducts } from "@/lib/topProducts";
import { getCampaignBrandMetrics } from "@/lib/campaignMetrics";
import { getBrandMetrics } from "@/lib/queries";
import { getAppReport } from "@/lib/appReport";
import { getSearchSnapshot } from "@/lib/searchSnapshot";
import { HAAT_AUGUST_2026 } from "@/lib/haatRegions";
import { getMediaPlanExecution } from "@/lib/mediaPlan";
import { getPlatformPlanExecution } from "@/lib/platformPlan";
import { getAwarenessReport } from "@/lib/awarenessReport";
import { TYPE_LABEL } from "@/lib/searchSnapshot";
import type { PlanRow, AdRow, LeadsBlock } from "@/lib/reportEmailExtra";
import { viewsInsights, appInsights, ecomInsights, leadsInsights, impShareInsights } from "@/lib/reportInsights";
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
  // dry=1 returns the computed facts and recommendations instead of sending — used to review and
  // tune the rules against real numbers without filling anyone's inbox.
  const dry = url.searchParams.get("dry") === "1";
  const facts: Record<string, unknown> = {};
  const recipients = mediaManagers();

  const out: Record<string, string> = {};
  const targets = BRANDS.filter((b) => !b.retired && (!only || b.id === only));
  for (const b of targets) {
    try {
      const prof = campaignProfileOf(b);
      const grp = reportGroupOf(b);
      let html: string | null = null;

      if (grp === "ecommerce") {
        const [r, products, allMetrics] = await Promise.all([
          getClientReport(b, from, to),
          getTopProducts(b, from, to).catch(() => null),
          getBrandMetrics(from, to).catch(() => []),
        ]);
        if (r) {
          // New-vs-returning lives in the daily metrics, not the report — the account is judged on
          // the mix, so the rules need it.
          const bm = allMetrics.find((m) => m.brandId === b.id);
          const audience = bm ? { newRevenue: bm.newRevenue, storeRevenue: bm.channels.site.revenue } : undefined;
          const ins = ecomInsights(b, r, products, audience);
          if (dry) facts[b.id] = {
            topLevel: r.topLevel, platforms: r.platforms,
            topAds: r.topAds.map((a) => ({ name: a.name, spend: a.spend, roas: a.roas, storeRevenue: a.storeRevenue, storeRoas: a.storeRoas })),
            products: products?.rows?.slice(0, 8), productTotal: products?.storeRevenue, distinctProducts: products?.distinctProducts,
            audience,
            targetRoas: b.targetRoas, insights: ins,
          };
          html = renderEmail(r, "", products, ins);
        }
      } else if (prof === "leads") {
        const m = await getCampaignBrandMetrics(b, from, to);
        if (m && (m.total.spend > 0 || m.total.leads > 0)) html = renderLeadsEmail(b, m, "", from, to, leadsInsights(b, m));
      } else if (prof === "app") {
        const r = await getAppReport(b, from, to);
        // The city table is the client's own registration count (their backend, not Meta's
        // attribution), so it only applies to the month it was compiled for.
        const cities = from.startsWith("2026-08") ? HAAT_AUGUST_2026.rows : undefined;
        if (r) html = renderAppEmail(b, r, "", from, to, cities, appInsights(b, r, cities));
      } else if (grp === "impshare") {
        const r = await getSearchSnapshot(b, from, to);
        if (r) html = renderImpShareEmail(b, r.sections, "", from, to, TYPE_LABEL, impShareInsights(b, r.sections));
      } else {
        const m = await getCampaignBrandMetrics(b, from, to);
        if (m && m.total.spend > 0) {
          // Plan vs execution, from whichever plan the brand carries.
          let plan: PlanRow[] | undefined;
          let flight: string | undefined;
          let elapsedPct: number | undefined;
          let leads: LeadsBlock | undefined;
          if (b.platformPlan) {
            const ex = await getPlatformPlanExecution(b).catch(() => null);
            if (ex) {
              flight = `${ex.flightStart} – ${ex.flightEnd}`;
              elapsedPct = ex.totalDays ? (ex.elapsedDays / ex.totalDays) * 100 : undefined;
              plan = ex.lines.map((l) => ({
                title: l.line.title, budget: l.line.budget, spend: l.actual.spend, spendPct: l.spendPct,
                target: l.line.thruplay, actual: l.actual.thruplay, pct: l.thruplayPct, unit: "ThruPlay",
              }));
              const lt = b.platformPlan.leadTarget;
              if (lt) {
                const lg = ex.leads.reduce((a, x) => ({ leads: a.leads + x.leadgenLeads, spend: a.spend + x.leadgenSpend }), { leads: 0, spend: 0 });
                leads = { leads: lg.leads, cpl: lg.leads ? lg.spend / lg.leads : null, targetLeads: lt.leads, targetCpa: lt.cpa };
              }
            }
          } else if (b.mediaPlan) {
            const ex = await getMediaPlanExecution(b).catch(() => null);
            if (ex) {
              flight = `${ex.flightStart} – ${ex.flightEnd}`;
              elapsedPct = ex.totalDays ? (ex.elapsedDays / ex.totalDays) * 100 : undefined;
              plan = ex.lines.map((l) => ({
                title: `${l.line.platform} · ${l.line.type}`, budget: l.line.budget, spend: l.actual.spend,
                spendPct: l.line.budget ? (l.actual.spend / l.line.budget) * 100 : null,
                target: l.line.thruplay || l.line.views, actual: l.actual.thruplay ?? l.actual.views,
                pct: (l.line.thruplay || l.line.views) ? ((l.actual.thruplay ?? l.actual.views) / (l.line.thruplay || l.line.views)) * 100 : null,
                unit: "צפיות",
              }));
            }
          }
          // Ad names — the awareness report can group at ad level.
          let ads: AdRow[] | undefined;
          const aw = await getAwarenessReport(b, from, to, "ad").catch(() => null);
          if (aw) {
            ads = aw.sources.flatMap((src) => src.campaigns.map((c) => ({
              name: c.name, spend: c.spend, views: c.views, cpv: c.views ? c.spend / c.views : null,
            }))).filter((a) => a.views > 0).sort((a, b2) => b2.views - a.views).slice(0, 8);
            if (!ads.length) ads = undefined;
          }
          const planPct = plan?.length
            ? (() => { const tg = plan.reduce((a, x) => a + x.target, 0); const ac = plan.reduce((a, x) => a + x.actual, 0); return tg ? (ac / tg) * 100 : null; })()
            : null;
          const insights = viewsInsights(b, m, { ads, leads, planPct, elapsedPct: elapsedPct ?? null });
          html = renderViewsEmail(b, m, "", from, to, { plan, ads, leads, flight, insights });
        }
      }

      if (!html) { out[b.id] = "skipped — no data"; continue; }
      if (dry) { out[b.id] = "dry"; continue; }
      await sendEmail({ to: recipients, subject: `סיכום חודשי · ${b.nameHe} · ${from} – ${to}`, html });
      out[b.id] = "sent";
    } catch (e) {
      out[b.id] = `error: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    }
  }
  return NextResponse.json({ ok: true, from, to, sentTo: dry ? [] : recipients, brands: out, ...(dry ? { facts } : {}) });
}
