// Client-facing conclusions, drafted from the recommendation engine — not from a model.
//
// reportInsights.ts writes for us: it names what's broken, what it's costing, and what to do about
// it. That register is right for an internal review and wrong for the client, who reads "paid ROAS
// is below its floor" as a report card on the agency. The brief here is explicit — the conclusions
// exist to show the client the account is in good hands, not to hand them a case against us — so
// every finding is restated as work we have already identified and are acting on, with the number
// that makes the action worth doing.
//
// Two rules follow from that:
//   - Nothing is invented. Every figure comes from the insight's own `data`, which is the same
//     arithmetic the internal version prints. The framing changes; the numbers never do.
//   - Some findings are internal-only. The Meta-vs-store attribution gap is real and it drives how
//     we budget, but telling a client the platform over-reports only teaches them to distrust the
//     numbers in the report they're reading. It stays out.
//
// Output is a draft. It lands in the manager's textarea to be edited before anything is sent.
import type { BrandConfig } from "./brands";
import type { ClientReport } from "./clientReport";
import type { Insight, InsightId } from "./reportInsights";
import type { TopProductsResult } from "./topProducts";

const ils = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
const r2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Findings that stay inside the agency, whatever their severity. */
const INTERNAL_ONLY = new Set<InsightId>(["attribution-gap"]);

// Each rule's client-facing voice. `d` is the insight's raw data bag, so the sentence carries the
// same figures the internal finding did. Returning null drops the finding from the draft.
const VOICE: Record<InsightId, (d: Record<string, number>, brand: BrandConfig) => string | null> = {
  "paid-roas-below-floor": (d) =>
    `רואס הממומן בתקופה עמד על ${r2(d.paidRoas)}, מתחת ליעד העבודה שלנו (${r2(d.floor)}). ריכזנו את התקציב בקמפיינים שמחזירים מעל היעד ועצרנו את אלה שמתחת, כדי שכל שקל יעבוד מול הרף שהגדרנו.`,

  "paid-roas-thin-margin": (d) =>
    `רואס הממומן עומד על ${r2(d.paidRoas)}, מעל יעד העבודה שלנו (${r2(d.floor)}) אך במרווח צר. לכן אנחנו מתמקדים כרגע בשיפור היעילות של הקווים החלשים לפני הרחבת תקציב — הגדלה לפני שיפור יעילות שוחקת את התשואה.`,

  "new-customer-share": (d) =>
    `${pct(d.share)} מההכנסות הגיעו מלקוחות חדשים. אנחנו מגדילים את המשקל לקהלים קרים ולקריאייטיב גיוס — סגירת הפער אל מול היעד (${pct(d.target)}) שווה כ-${ils(d.gapValue)} הכנסות נוספות מלקוחות חדשים.`,

  "efficient-small-channel": (d) =>
    `זיהינו ערוץ שמחזיר ${r2(d.bestRoas)} על תקציב קטן יחסית (${ils(d.bestSpend)}), לעומת ${r2(d.biggestRoas)} בערוץ המרכזי. אנחנו מגדילים אותו בהדרגה לאורך ${Math.round(d.rampDays)} ימים — העלאה חדה מחזירה קמפיין לשלב למידה ומייקרת את התוצאה, ולכן העלייה מדודה.`,

  "creative-spread": (d) =>
    `יש פער משמעותי בין המודעות: המובילה מחזירה ${r2(d.bestRoas)} מול ${r2(d.worstRoas)} בחלשה. הסטנו את ${ils(d.worstSpend)} למודעות המובילות — פוטנציאל של כ-${ils(d.gain)} הכנסות נוספות באותו תקציב.`,

  "brand-creative-behind": (d) =>
    `קריאייטיב המשפיעניות מביא תוצאה טובה, אך הוא נושא עמלה על כל המרה — ובחישוב נטו הוא מחזיר ${r2(d.netInflRoas)} מול ${r2(d.brandRoas)} של קריאייטיב המותג. כדי להקטין את התלות ולהוזיל את עלות ההמרה, נשמח לקבל סט קריאייטיב מותג חדש: אם יגיע לרמת היעילות הזו, אותו תקציב צפוי להניב כ-${ils(d.uplift)} הכנסות נוספות.`,

  "brand-creative-ahead": (d) =>
    `קריאייטיב המותג מחזיר ${r2(d.brandRoas)} — יעיל יותר מקריאייטיב המשפיעניות בחישוב נטו אחרי עמלה (${r2(d.netInflRoas)}). אנחנו מגדילים את משקלו: אותה תוצאה בלי עלות העמלה.`,

  "product-concentration": (d) =>
    `${pct(d.share)} מהמכירות מרוכזות בשלושה מוצרים. אנחנו ממליצים על קמפיין ייעודי למוצר נוסף עם ביקוש מוכח, כדי לפזר את התלות ולהרחיב את בסיס ההכנסה.`,

  "attribution-gap": () => null, // internal only — see the header
};

export interface ClientConclusionsDraft {
  text: string;
  /** Which findings made it into the draft, and which were held back — shown to the manager so the
   *  draft isn't a black box and they know what they're not sending. */
  used: InsightId[];
  withheld: InsightId[];
}

export function buildEcomClientConclusions(
  brand: BrandConfig,
  r: ClientReport,
  insights: Insight[],
  products?: TopProductsResult | null,
): ClientConclusionsDraft {
  const used: InsightId[] = [];
  const withheld: InsightId[] = [];
  const t = r.topLevel;

  // 1. Open on the period's result. Whatever follows, the client should first see the outcome.
  const headline: string[] = [];
  const paid = r.paidStoreRoas ?? t.paidRoas;
  headline.push(`בתקופת ${r.periodLabel} הושקעו ${ils(t.totalSpend)} במדיה, והחנות רשמה ${ils(t.storeRevenue)} הכנסות ב-${Math.round(t.orders).toLocaleString("en-US")} הזמנות.`);
  if (paid != null) headline.push(`רואס ממומן ${r2(paid)}${t.siteRoas != null ? `, רואס חנות כולל ${r2(t.siteRoas)}` : ""}.`);

  // 2. What worked — named, so the client sees where the results came from.
  const wins: string[] = [];
  const bestPlat = r.platforms.filter((p) => p.spend > 0 && p.roas != null).sort((a, b) => b.roas! - a.roas!)[0];
  if (bestPlat) wins.push(`הערוץ המוביל בתקופה: ${bestPlat.platform} ברואס ${r2(bestPlat.roas!)}.`);
  const bestAd = r.topAds.filter((a) => a.spend > 0 && a.roas != null).sort((a, b) => b.roas! - a.roas!)[0];
  if (bestAd) wins.push(`המודעה המובילה: "${bestAd.name}" ברואס ${r2(bestAd.roas!)}.`);
  const topProduct = products?.rows?.[0];
  if (topProduct) wins.push(`המוצר המוביל: ${topProduct.name} (${ils(topProduct.revenue)}).`);

  // 3. The engine's findings, each restated as work in progress.
  const actions: string[] = [];
  for (const ins of insights) {
    if (!ins.id) continue;
    if (INTERNAL_ONLY.has(ins.id)) { withheld.push(ins.id); continue; }
    const line = VOICE[ins.id]?.(ins.data ?? {}, brand);
    if (!line) { withheld.push(ins.id); continue; }
    actions.push(line);
    used.push(ins.id);
  }

  const parts: string[] = [headline.join(" ")];
  if (wins.length) parts.push(`מה עבד בתקופה:\n${wins.map((w) => `• ${w}`).join("\n")}`);
  if (actions.length) parts.push(`מה אנחנו עושים מכאן:\n${actions.map((a) => `• ${a}`).join("\n")}`);

  return { text: parts.join("\n\n"), used, withheld };
}
