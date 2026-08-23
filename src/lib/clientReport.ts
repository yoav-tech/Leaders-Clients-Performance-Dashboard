// Client-facing performance report (ecommerce brands: Argania, La Beaute, Studio Pasha).
// Assembles the numbers Gal reviews before sending to the client: top-level ROAS, per-platform
// table, newsletter sign-ups (Meta complete_registration), top ads by ROAS, and an auto summary.
import { reportGroupOf, type BrandConfig } from "./brands";
import { getBrandMetrics } from "./queries";
import { fetchWindsor, num } from "./windsor";
import { fetchQuickShopPaidOrders } from "./quickshop";
import { fetchShopifyPaidOrders } from "./shopify";
import { toIls } from "./fx";

const normId = (v: unknown) => String(v ?? "").replace(/^act_/i, "").trim();
function sumAction(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((s: number, a) => s + num((a as { value?: string | number | null })?.value), 0);
  return num(v as string | number | null | undefined);
}

export interface PlatformRow { platform: string; spend: number; revenue: number; roas: number | null; cvr: number | null; aov: number | null }
export interface TopAd {
  name: string; spend: number; revenue: number; roas: number | null; previewUrl: string | null;
  storeRevenue: number | null; // REAL store revenue attributed to this ad (QuickShop/Shopify utm_content = ad name)
  storeRoas: number | null; // storeRevenue ÷ spend
}

// Real store revenue per ad, matched by utm_content (= ad name) from the store's paid orders.
async function storeRevByAd(brand: BrandConfig, from: string, to: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const orders = brand.storePlatform === "shopify" ? (await fetchShopifyPaidOrders(brand, from, to)).orders : await fetchQuickShopPaidOrders(brand, from, to);
    for (const o of orders) {
      const c = (o.utmContent ?? "").trim().toLowerCase();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + o.total);
    }
  } catch {
    /* store revenue optional — falls back to Meta-only ROAS */
  }
  return map;
}

// A public, clickable preview of the ad creative for the client. Prefer the Instagram post permalink;
// fall back to the Facebook page-post permalink built from effective_object_story_id (page_post).
function adPreviewUrl(ig: string, story: string): string | null {
  if (ig) return ig;
  if (story && story.includes("_")) { const [page, post] = story.split("_"); if (page && post) return `https://www.facebook.com/${page}/posts/${post}`; }
  return null;
}
export interface ClientReport {
  brandId: string;
  brandName: string;
  from: string;
  to: string;
  periodLabel: string; // human-readable Hebrew period the report covers (so the מלל is unambiguous)
  target: number;
  topLevel: { siteRoas: number | null; paidRoas: number | null; cvr: number | null; cvrPrev: number | null; storeRevenue: number; totalSpend: number; orders: number };
  platforms: PlatformRow[];
  registrations: number;
  topAds: TopAd[];
  summary: string;
}

// Hebrew, human-readable period label — states clearly which window the report covers.
// A full calendar month → "אוגוסט 2026"; otherwise a date range → "16 ביולי – 16 באוגוסט 2026".
const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
function lastDayOfMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function periodLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fy === ty && fm === tm && fd === 1 && td === lastDayOfMonth(ty, tm)) return `${HE_MONTHS[fm - 1]} ${fy}`;
  const heDay = (d: number, m: number) => `${d} ב${HE_MONTHS[m - 1]}`;
  const left = fy === ty ? heDay(fd, fm) : `${heDay(fd, fm)} ${fy}`;
  return `${left} – ${heDay(td, tm)} ${ty}`;
}

const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

// Top Meta ads by ROAS + total newsletter sign-ups (complete_registration), ILS.
async function metaAdsAndRegs(brand: BrandConfig, from: string, to: string): Promise<{ topAds: TopAd[]; registrations: number }> {
  if (!brand.metaAccountId) return { topAds: [], registrations: 0 };
  try {
    const rows = await fetchWindsor({
      connector: "facebook",
      fields: ["account_id", "currency", "ad_name", "spend", "actions_purchase", "action_values_purchase", "actions_complete_registration", "instagram_permalink_url", "effective_object_story_id"],
      dateFrom: from, dateTo: to, accounts: [brand.metaAccountId], cacheSeconds: 1800,
    });
    const acc = normId(brand.metaAccountId);
    // Track the creative's post links from the highest-spend row under each ad name (best) so the
    // preview points at the dominant creative when several ads share a name.
    const map = new Map<string, { spend: number; rev: number; best: number; ig: string; story: string }>();
    let registrations = 0;
    for (const r of rows) {
      if (normId(r.account_id) !== acc) continue;
      const cur = String(r.currency ?? "ILS").toUpperCase();
      registrations += sumAction(r.actions_complete_registration);
      const name = String(r.ad_name ?? "").trim();
      if (!name) continue;
      const rowSpend = toIls(num(r.spend), cur, 3);
      const e = map.get(name) ?? { spend: 0, rev: 0, best: -1, ig: "", story: "" };
      e.spend += rowSpend;
      e.rev += toIls(sumAction(r.action_values_purchase), cur, 3);
      if (rowSpend > e.best) { e.best = rowSpend; e.ig = String(r.instagram_permalink_url ?? "").trim(); e.story = String(r.effective_object_story_id ?? "").trim(); }
      map.set(name, e);
    }
    const topAds = [...map]
      .filter(([, e]) => e.spend >= 100) // ignore tiny-spend outliers so ROAS is meaningful
      .map(([name, e]) => ({ name, spend: Math.round(e.spend), revenue: Math.round(e.rev), roas: e.spend ? e.rev / e.spend : null, previewUrl: adPreviewUrl(e.ig, e.story), storeRevenue: null as number | null, storeRoas: null as number | null }))
      .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
      .slice(0, brand.topAdsCount ?? 5);
    return { topAds, registrations: Math.round(registrations) };
  } catch {
    return { topAds: [], registrations: 0 };
  }
}

const roasStr = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pctStr = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export async function getClientReport(brand: BrandConfig, from: string, to: string): Promise<ClientReport | null> {
  if (reportGroupOf(brand) !== "ecommerce") return null;
  const [all, meta, storeByAd] = await Promise.all([getBrandMetrics(from, to), metaAdsAndRegs(brand, from, to), storeRevByAd(brand, from, to)]);
  const m = all.find((x) => x.brandId === brand.id);
  if (!m) return null;

  // Attach REAL store revenue + store ROAS to each top ad (matched by utm_content = ad name).
  const topAds: TopAd[] = meta.topAds.map((a) => {
    const sr = storeByAd.get(a.name.trim().toLowerCase());
    return { ...a, storeRevenue: sr != null ? Math.round(sr) : null, storeRoas: sr != null && a.spend ? sr / a.spend : null };
  });

  const platforms: PlatformRow[] = (["meta", "google", "tiktok"] as const)
    .map((ch) => {
      const c = m.channels[ch];
      return { platform: CH_LABEL[ch], spend: Math.round(c.spend), revenue: Math.round(c.revenue), roas: c.roas, cvr: c.cvr, aov: c.aov };
    })
    .filter((r) => r.spend > 0 || r.revenue > 0);

  const cvr = m.total.clicks ? m.channels.site.purchases / m.total.clicks : null;
  const cvrPrev = m.previous && m.previous.clicks ? m.previous.siteOrders / m.previous.clicks : null;
  const siteRoas = m.blendedRoas;
  const paidRoas = m.total.roas;

  const label = periodLabel(from, to);
  const top = topAds[0];
  const bestPlatform = [...platforms].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  const summary =
    `סיכום לתקופה ${label}: רואס אתר כולל ${roasStr(siteRoas)}, רואס ממומן ${roasStr(paidRoas)}, אחוז המרה ${pctStr(cvr)}. ` +
    `${meta.registrations.toLocaleString("en-US")} הרשמות לדיוור ממטא. ` +
    (top ? `המודעה המובילה ברואס: "${top.name}" (רואס ${roasStr(top.roas)}). ` : "") +
    (bestPlatform ? `הפלטפורמה החזקה ביותר: ${bestPlatform.platform} (רואס ${roasStr(bestPlatform.roas)}).` : "");

  return {
    brandId: brand.id,
    brandName: brand.name,
    from, to,
    periodLabel: label,
    target: brand.targetRoas,
    topLevel: { siteRoas, paidRoas, cvr, cvrPrev, storeRevenue: Math.round(m.channels.site.revenue), totalSpend: Math.round(m.total.spend), orders: Math.round(m.channels.site.purchases) },
    platforms,
    registrations: meta.registrations,
    topAds,
    summary,
  };
}
