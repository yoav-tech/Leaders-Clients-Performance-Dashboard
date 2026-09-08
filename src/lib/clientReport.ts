// Client-facing performance report (ecommerce brands: Argania, La Beaute, Studio Pasha).
// Assembles the numbers Gal reviews before sending to the client: top-level ROAS, per-platform
// table, newsletter sign-ups (Meta complete_registration), top ads by ROAS, and an auto summary.
import { unstable_cache } from "next/cache";
import { reportGroupOf, getBrand, type BrandConfig } from "./brands";
import { playbookFor } from "./playbooks";
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
// Cached (30 min, shared) — the store order pull is heavy and unchanged intraday. Returns a plain
// record (Maps don't survive unstable_cache); the caller rebuilds the Map.
const _storeRevByAd = unstable_cache(
  async (brandId: string, from: string, to: string): Promise<Record<string, number>> => {
    const brand = getBrand(brandId);
    const out: Record<string, number> = {};
    if (!brand) return out;
    try {
      const orders = brand.storePlatform === "shopify" ? (await fetchShopifyPaidOrders(brand, from, to)).orders : await fetchQuickShopPaidOrders(brand, from, to);
      for (const o of orders) {
        const c = (o.utmContent ?? "").trim().toLowerCase();
        if (!c) continue;
        out[c] = (out[c] ?? 0) + o.total;
      }
    } catch {
      /* store revenue optional — falls back to Meta-only ROAS */
    }
    return out;
  },
  ["store-rev-by-ad-v1"],
  { revalidate: 1800, tags: ["metrics"] },
);
async function storeRevByAd(brand: BrandConfig, from: string, to: string): Promise<Map<string, number>> {
  return new Map(Object.entries(await _storeRevByAd(brand.id, from, to)));
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
  // Influencer vs brand creative, when the playbook names the creators. Commission on
  // influencer conversions is invisible to every platform's ROAS, so it's carried here.
  creativeSplit?: { influencerSpend: number; influencerRevenue: number; influencerAds: number; brandSpend: number; brandRevenue: number; brandAds: number } | null;
  // Paid ROAS on store-attributed revenue (UTM), not what the platforms claim.
  paidStoreRoas?: number | null;
  paidStoreRevenue?: number | null;
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
// Store revenue attributed to PAID media by UTM — the basis the account is actually judged on.
// Platform-reported revenue overstates badly (Meta ran 2.3x the store figure on Argania in
// August), so a ROAS floor has to be measured against what the store recorded, not what the ad
// platform claimed. Organic sources that merely contain a platform's name (google_organic,
// instagram bio, facebook/organic) are excluded — matching on the source string alone counts them.
const PAID_SOURCES = new Set(["ig", "fb", "facebook", "instagram", "google", "tiktok", "meta"]);
const NON_PAID_MEDIUM = /organic|bio|referral|email|sms|chat/;

const _paidStoreRevenue = async (brandId: string, from: string, to: string): Promise<number> => {
  const brand = getBrand(brandId);
  if (!brand) return 0;
  try {
    const orders = brand.storePlatform === "shopify"
      ? (await fetchShopifyPaidOrders(brand, from, to)).orders
      : await fetchQuickShopPaidOrders(brand, from, to);
    let total = 0;
    for (const o of orders) {
      const src = (o.utmSource ?? "").toLowerCase().trim();
      const med = (o.utmMedium ?? "").toLowerCase().trim();
      if (!PAID_SOURCES.has(src)) continue;
      if (NON_PAID_MEDIUM.test(med)) continue;
      total += o.total;
    }
    return total;
  } catch {
    return 0;
  }
};
const paidStoreRevenue = unstable_cache(_paidStoreRevenue, ["paid-store-revenue-v1"], { revalidate: 1800, tags: ["client-report"] });

async function metaAdsAndRegs(brand: BrandConfig, from: string, to: string): Promise<{ topAds: TopAd[]; registrations: number; creativeSplit: ClientReport["creativeSplit"] }> {
  if (!brand.metaAccountId) return { topAds: [], registrations: 0, creativeSplit: null };
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
    const pbook = playbookFor(brand.id);
    const creators = (pbook?.creators ?? []).map((c) => c.toLowerCase());
    let creativeSplit: { influencerSpend: number; influencerRevenue: number; influencerAds: number; brandSpend: number; brandRevenue: number; brandAds: number } | null = null;
    if (creators.length) {
      const acc2 = { influencerSpend: 0, influencerRevenue: 0, influencerAds: 0, brandSpend: 0, brandRevenue: 0, brandAds: 0 };
      for (const [name, e] of map) {
        const isInfluencer = creators.some((c) => name.toLowerCase().startsWith(c));
        if (isInfluencer) { acc2.influencerSpend += e.spend; acc2.influencerRevenue += e.rev; acc2.influencerAds++; }
        else { acc2.brandSpend += e.spend; acc2.brandRevenue += e.rev; acc2.brandAds++; }
      }
      creativeSplit = acc2;
    }

    const topAds = [...map]
      .filter(([, e]) => e.spend >= 100) // ignore tiny-spend outliers so ROAS is meaningful
      .map(([name, e]) => ({ name, spend: Math.round(e.spend), revenue: Math.round(e.rev), roas: e.spend ? e.rev / e.spend : null, previewUrl: adPreviewUrl(e.ig, e.story), storeRevenue: null as number | null, storeRoas: null as number | null }))
      .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
      .slice(0, brand.topAdsCount ?? 5);
    return { topAds, registrations: Math.round(registrations), creativeSplit };
  } catch {
    return { topAds: [], registrations: 0, creativeSplit: null };
  }
}

const roasStr = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pctStr = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export async function getClientReport(brand: BrandConfig, from: string, to: string): Promise<ClientReport | null> {
  if (reportGroupOf(brand) !== "ecommerce") return null;
  const [all, meta, storeByAd, paidStoreRev] = await Promise.all([getBrandMetrics(from, to), metaAdsAndRegs(brand, from, to), storeRevByAd(brand, from, to), paidStoreRevenue(brand.id, from, to)]);
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
    creativeSplit: meta.creativeSplit,
    paidStoreRevenue: Math.round(paidStoreRev),
    paidStoreRoas: m.total.spend ? paidStoreRev / m.total.spend : null,
    topAds,
    summary,
  };
}
