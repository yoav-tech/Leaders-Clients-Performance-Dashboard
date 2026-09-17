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
import type { CampBrandMetrics } from "./campaignMetrics";
import type { AppReport } from "./appReport";
import type { SnapSection } from "./searchSnapshot";
import type { PlatformPlanExecution } from "./platformPlan";
import type { TopProductsResult } from "./topProducts";
import type { InsightFeedback } from "./insightFeedbackStore";
import { renderTemplate, templateUnbound } from "./insightTemplate";
import { renderAccountChanges, type AccountChanges } from "./accountChanges";

const ils = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
const r2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ils3 = (v: number) => `₪${v.toFixed(3)}`;
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

/** Findings that stay inside the agency, whatever their severity. */
const INTERNAL_ONLY = new Set<InsightId>(["attribution-gap"]);

// Each rule's client-facing voice. `d` is the insight's raw data bag, so the sentence carries the
// same figures the internal finding did. Returning null drops the finding from the draft.
type Voice = (d: Record<string, number>, l: Record<string, string>, brand: BrandConfig) => string | null;
const VOICE: Record<InsightId, Voice> = {
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

  // ── video / awareness ───────────────────────────────────────────────────────────────────────
  "cpv-above-target": (d) =>
    `עלות הצפייה בתקופה עמדה על ${ils3(d.cpv)} מול יעד ${ils3(d.target)}. אנחנו מרכזים את התקציב בקריאייטיב ובפלטפורמה שמספקים את הצפייה הזולה ביותר ועוצרים קווים חורגים — באותה הוצאה היעד שווה ${n0(d.wouldBuy)} צפיות במקום ${n0(d.views)}.`,
  "cpv-below-target": (d) =>
    `עלות הצפייה עומדת על ${ils3(d.cpv)}, מתחת ליעד (${ils3(d.target)}). יש מרווח להרחיב נפח: תוספת של ${ils(d.addSpend)} צפויה להוסיף כ-${n0(d.addViews)} צפיות במחיר הנוכחי.`,
  "platform-cpv-gap": (d, l) =>
    `${chan(l.best)} מספקת צפייה ב-${ils3(d.bestCpv)} מול ${ils3(d.worstCpv)} ב-${chan(l.worst)}. הסטנו ${ils(d.move)} לכיוון הערוץ היעיל — כ-${n0(d.gain)} צפיות נוספות באותו תקציב.`,
  "creative-cpv-gap": (d, l) =>
    `זיהינו פער של פי ${d.ratio.toFixed(1)} בין הקריאייטיבים: "${l.best}" מייצר צפייה ב-${ils3(d.bestCpv)} מול ${ils3(d.worstCpv)} ב-"${l.worst}". עצרנו את החלש והסטנו את ${ils(d.worstSpend)} שלו למוביל — כ-${n0(d.gain)} צפיות נוספות.`,
  "flight-behind-plan": (d) =>
    `הפריסה מאחורי לוח הזמנים: עברו ${Math.round(d.elapsedPct)}% מהתקופה מול ${Math.round(d.planPct)}% מיעד הצפיות. אנחנו מגדילים תקציב יומי בקווים שמפגרים ומעבירים יעד צפיות לקווים שמספקים מתחת ליעד העלות.`,
  "leads-below-target": (d) =>
    `נאספו ${n0(d.leads)} לידים מתוך יעד ${n0(d.targetLeads)}. ${d.cost > 0 ? `במחיר הנוכחי סגירת הפער דורשת תוספת של כ-${ils(d.cost)}` : "אנחנו מחדדים קהלים וקריאייטיב לפני הגדלת תקציב"}.`,

  // ── app ─────────────────────────────────────────────────────────────────────────────────────
  "cpreg-at-target": (d) =>
    `עלות ההרשמה עומדת על ${ils(d.cpReg)}, מתחת לתקרה (${ils(d.ceiling)}). המרווח של ${ils(d.headroom)} להרשמה מאפשר לנו להרחיב נפח בערים שמתחת לתקרה.`,
  "cpreg-over-ceiling": (d) =>
    `עלות ההרשמה בתקופה הייתה ${ils(d.cpReg)} מול תקרה של ${ils(d.ceiling)}. אנחנו מצמצמים תקציב בערים היקרות ומסיטים אותו לזולות כדי להחזיר את העלות אל מתחת לתקרה.`,
  "cities-over-ceiling": (d, l) =>
    `${Math.round(d.count)} ערים חרגו מהתקרה (${l.cities}). הסטנו את ${ils(d.spendAtRisk)} שלהן ל${l.best}, שמספקת הרשמה ב-${ils(d.bestCpr)} — כ-${n0(d.gain)} הרשמות נוספות באותו תקציב.`,
  "cities-headroom": (d, l) =>
    `${l.cities} מספקות הרשמה הרבה מתחת לתקרה. אנחנו מגדילים בהן תקציב: כל ₪1,000 נוספים ב${l.best} שווים כ-${n0(d.per1000)} הרשמות.`,
  "install-to-reg": (d) =>
    `${pct(d.rate)} מההתקנות הופכות להרשמה. שיפור השלב הזה ל-55% שווה כ-${n0(d.gain)} הרשמות נוספות באותו תקציב — נשמח לעבור יחד על מסך ההרשמה והאונבורדינג באפליקציה.`,

  // ── leads ───────────────────────────────────────────────────────────────────────────────────
  "cpl-above-target": (d) =>
    `עלות הליד בתקופה עמדה על ${ils(d.cpl)} מול יעד ${ils(d.target)}. אנחנו עוצרים את הקווים היקרים ומסיטים את תקציבם למובילים — באותה הוצאה היעד שווה ${n0(d.wouldBuy)} לידים במקום ${n0(d.leads)}.`,
  "cpl-at-target": (d) =>
    `עלות הליד עומדת על ${ils(d.cpl)}, בתוך היעד (${ils(d.target)}). יש מרווח להרחיב נפח: תוספת של ${ils(d.addSpend)} שווה כ-${n0(d.addLeads)} לידים במחיר הנוכחי.`,
  "channel-cpl-gap": (d, l) =>
    `${chan(l.best)} מייצרת לידים זולים ב-${Math.round(d.cheaperPct)}% מ-${chan(l.worst)} (${ils(d.bestCpl)} מול ${ils(d.worstCpl)}). העברנו ${ils(d.move)} לערוץ היעיל — כ-${n0(d.gain)} לידים נוספים באותו כסף.`,
  "budget-underspend": (d) =>
    `נוצלו ${ils(d.spend)} מתוך ${ils(d.budget)} בתקופה. אנחנו פותחים את חסמי התקציב היומי כדי לנצל את המסגרת במלואה${d.missedLeads > 0 ? ` — ניצול מלא במחיר הנוכחי שווה כ-${n0(d.missedLeads)} לידים נוספים` : ""}.`,

  // ── per-platform media plan (Chery, Xpeng) ─────────────────────────────────────────────────
  "plan-cost-per-completed": (d) =>
    d.actual <= d.plan
      ? `עלות הצפייה המלאה בתקופה עמדה על ${ils3(d.actual)} מול יעד ${ils3(d.plan)} בפריסה — פי ${d.ratio.toFixed(1)} טוב מהמתוכנן. ${n0(d.completed)} צפיות מלאות נרשמו על ${ils(d.spend)}, ויש מרווח להרחיב נפח בערוץ היעיל ביותר.`
      : `עלות הצפייה המלאה עמדה על ${ils3(d.actual)} מול יעד ${ils3(d.plan)}. אנחנו מרכזים את התקציב בערוץ עם העלות הנמוכה ביותר כדי להחזיר אותה אל היעד.`,
  "platform-completed-gap": (d, l) =>
    `${l.best} מייצרת צפייה מלאה ב-${ils3(d.bestCp)} מול ${ils3(d.worstCp)} ב-${l.worst}. אנחנו מסיטים משקל לכיוון היעיל — העברת ${ils(d.move)} שווה כ-${n0(d.gain)} צפיות מלאות נוספות באותו תקציב.`,
  "youtube-format-gap": (d, l) =>
    `ביוטיוב, ${l.best} מייצר צפייה מלאה ב-${ils3(d.bestCp)} מול ${ils3(d.worstCp)} ב-${l.worst} — פי ${d.ratio.toFixed(1)}. אנחנו מעבירים משקל לפורמט היעיל: העברת ${ils(d.move)} שווה כ-${n0(d.gain)} צפיות מלאות נוספות.`,
  "plan-budget-pace": (d) =>
    d.spendPct >= d.elapsedPct
      ? `ניצול התקציב ${pct(d.spendPct)} מול ${pct(d.elapsedPct)} מהתקופה — הפריסה מקדימה את לוח הזמנים.`
      : `נותרו ${ils(d.left)} ל-${n0(d.daysLeft)} ימי פעילות. אנחנו מגדילים קצב ל-${ils(d.perDay)} ליום כדי לנצל את הפריסה במלואה.`,
  "plan-lead-goal": (d) =>
    `${n0(d.leads)} לידים מתוך יעד ${n0(d.target)}, בעלות ${ils(d.cpl)} לליד מול יעד ${ils(d.targetCpa)}${d.bonus > 0 ? ` — ובנוסף ${n0(d.bonus)} המרות שהגיעו מקמפייני הצפיות ללא עלות ייעודית` : ""}.`,

  // ── search share of voice ───────────────────────────────────────────────────────────────────
  "impshare-lost-budget": (d, l) =>
    `ב${l.section} אנחנו נוכחים ב-${pct(d.impShare)} מהחיפושים הרלוונטיים, ו-${pct(d.lostBudget)} מהחשיפות אבדו בגלל תקציב ולא בגלל איכות — כלומר המודעות מנצחות את המכרז וייגמר להן התקציב. נקודת נוכחות עולה כ-${ils(d.perPoint)} בחודש; הגעה ל-50% דורשת תוספת של כ-${ils(d.toHalf)} בחודש.`,
  "impshare-lost-rank": (d, l) =>
    `ב${l.section} ${pct(d.lostRank)} מהחשיפות אבדו בגלל דירוג. אנחנו משפרים רלוונטיות ודפי נחיתה כדי לנצח יותר מכרזים באותו תקציב.`,
};

/** One line of the draft, reviewable on its own so a correction attaches to the rule that wrote it. */
export interface DraftLine {
  id: InsightId;
  text: string;
  severity: Insight["severity"];
  /** The engine's own wording, kept even when a learned one is in use — so the manager can see what
   *  their correction replaced, and revert to it. */
  generated: string;
  /** Where this line's wording came from. */
  source: "engine" | "learned";
  /** Set on a learned line whose stored figures the rule no longer emits: the placeholders can't be
   *  filled, so the wording needs another pass. */
  staleFigures?: string[];
  /** Previously approved by a manager, wording unchanged since. */
  approved?: boolean;
}

export interface ClientConclusionsDraft {
  text: string;
  /** Per-line, so the UI can offer approve / correct against the rule that produced each one. */
  lines: DraftLine[];
  /** Which findings made it into the draft, and which were held back — shown to the manager so the
   *  draft isn't a black box and they know what they're not sending. */
  used: InsightId[];
  withheld: InsightId[];
  /** The account-change lines, so a caller can show them separately from the rule findings. */
  changes: string[];
}

export function buildEcomClientConclusions(
  brand: BrandConfig,
  r: ClientReport,
  insights: Insight[],
  products?: TopProductsResult | null,
  /** What managers have already taught the engine for this brand, keyed by rule. */
  feedback: Record<string, InsightFeedback> = {},
  /** What actually moved in the account this period, read from the platforms. */
  changes?: AccountChanges | null,
): ClientConclusionsDraft {
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

  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}

/** The shared shape of every client draft: the period's result, the work done in the account, what
 *  worked, and what happens next. Only the first two sections differ by report type, so the rest —
 *  including everything the engine learned — lives here and is written once. */
export function composeDraft(opts: {
  brand: BrandConfig;
  headline: string[];
  wins: string[];
  insights: Insight[];
  feedback?: Record<string, InsightFeedback>;
  changes?: AccountChanges | null;
}): ClientConclusionsDraft {
  const { brand, headline, wins, insights } = opts;
  const feedback = opts.feedback ?? {};
  const changes = opts.changes;
  const used: InsightId[] = [];
  const withheld: InsightId[] = [];

  const lines: DraftLine[] = [];
  for (const ins of insights) {
    if (!ins.id) continue;
    if (INTERNAL_ONLY.has(ins.id)) { withheld.push(ins.id); continue; }
    const generated = VOICE[ins.id]?.(ins.data ?? {}, ins.labels ?? {}, brand);
    if (!generated) { withheld.push(ins.id); continue; }

    const fb = feedback[ins.id];
    // Deleted from the sent report enough times that drafting it again is just making work.
    if (fb?.suppressed) { withheld.push(ins.id); continue; }
    const data = ins.data ?? {};
    let text = generated;
    let source: DraftLine["source"] = "engine";
    let staleFigures: string[] | undefined;

    if (fb?.status === "corrected" && fb.template) {
      const unbound = templateUnbound(fb.template, data);
      text = renderTemplate(fb.template, data);
      source = "learned";
      if (unbound.length) staleFigures = unbound;
    }

    lines.push({ id: ins.id, text, severity: ins.severity, generated, source, staleFigures, approved: fb?.status === "approved" });
    used.push(ins.id);
  }
  const actions = lines.map((l) => l.text);

  // The work done in the account, read from the platforms rather than from a hand-kept log. It sits
  // above the results: a client reading only outcomes is left to guess whether anything was done to
  // produce them.
  const changeLines = renderAccountChanges(changes ?? null);

  const parts: string[] = [headline.join(" ")];
  if (changeLines.length) parts.push(`מה שינינו בחשבון בתקופה:\n${changeLines.map((c) => `• ${c}`).join("\n")}`);
  if (wins.length) parts.push(`מה עבד בתקופה:\n${wins.map((w) => `• ${w}`).join("\n")}`);
  if (actions.length) parts.push(`מה אנחנו עושים מכאן:\n${actions.map((a) => `• ${a}`).join("\n")}`);

  return { text: parts.join("\n\n"), lines, used, withheld, changes: changeLines };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The other report types. Each supplies only its own opening and its own "what worked" — the rest
// of the draft, and everything learned from previous sends, is composeDraft's.

const n0i = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
// Channel ids are lowercase internally; a client-facing sentence should name the platform the way
// the client does.
const CHANNEL_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok", site: "החנות" };
const chan = (c: string) => CHANNEL_LABEL[c.toLowerCase()] ?? c;

/** Video / awareness clients (SCJ, Style, Protein Max, Tvuot). */
export function buildViewsClientConclusions(
  brand: BrandConfig, periodLabel: string, m: CampBrandMetrics, insights: Insight[],
  feedback?: Record<string, InsightFeedback>, changes?: AccountChanges | null,
): ClientConclusionsDraft {
  const t = m.total;
  const headline = [`בתקופת ${periodLabel} הושקעו ${ils(t.spend)} במדיה, שייצרו ${n0i(t.impressions)} חשיפות${t.views ? ` ו-${n0i(t.views)} צפיות` : ""}.`];
  if (t.cpv != null) headline.push(`עלות לצפייה ${ils3(t.cpv)}${brand.targetCpv ? ` מול יעד ${ils3(brand.targetCpv)}` : ""}.`);

  const wins: string[] = [];
  const chans = m.channels.filter((c) => c.channel !== "total" && c.views > 0 && c.cpv != null);
  const best = chans.length ? chans.reduce((a, b) => ((a.cpv ?? 9e9) <= (b.cpv ?? 9e9) ? a : b)) : null;
  if (best) wins.push(`הערוץ היעיל בתקופה: ${chan(String(best.channel))}, צפייה ב-${ils3(best.cpv!)}.`);
  if (t.reach) wins.push(`נחשפו ${n0i(t.reach)} משתמשים ייחודיים.`);
  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}

/** Lead-generation clients (Leaders, Bestie). */
export function buildLeadsClientConclusions(
  brand: BrandConfig, periodLabel: string, m: CampBrandMetrics, insights: Insight[],
  feedback?: Record<string, InsightFeedback>, changes?: AccountChanges | null,
): ClientConclusionsDraft {
  const t = m.total;
  const headline = [`בתקופת ${periodLabel} הושקעו ${ils(t.spend)} במדיה ונאספו ${n0i(t.leads)} לידים.`];
  if (t.cpl != null) headline.push(`עלות לליד ${ils(t.cpl)}${brand.targetCpl ? ` מול יעד ${ils(brand.targetCpl)}` : ""}.`);

  const wins: string[] = [];
  const chans = m.channels.filter((c) => c.channel !== "total" && c.leads > 0 && c.cpl != null);
  const best = chans.length ? chans.reduce((a, b) => ((a.cpl ?? 9e9) <= (b.cpl ?? 9e9) ? a : b)) : null;
  if (best) wins.push(`הערוץ היעיל בתקופה: ${chan(String(best.channel))}, ליד ב-${ils(best.cpl!)}.`);
  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}

/** App clients (Haat) — the KPI is registrations, not leads. */
export function buildAppClientConclusions(
  brand: BrandConfig, periodLabel: string, r: AppReport, insights: Insight[],
  feedback?: Record<string, InsightFeedback>, changes?: AccountChanges | null,
): ClientConclusionsDraft {
  const app = r.sections.filter((s) => s.kind === "app");
  const spend = r.sections.reduce((a, s) => a + s.totals.spend, 0);
  const appSpend = app.reduce((a, s) => a + s.totals.spend, 0);
  const regs = app.reduce((a, s) => a + s.totals.registrations, 0);
  const installs = app.reduce((a, s) => a + s.totals.installs, 0);
  const cpReg = regs ? appSpend / regs : null;

  const headline = [`בתקופת ${periodLabel} הושקעו ${ils(spend)} במדיה, שייצרו ${n0i(installs)} התקנות ו-${n0i(regs)} הרשמות.`];
  if (cpReg != null) headline.push(`עלות להרשמה ${ils(cpReg)}${brand.targetCpReg ? ` מול תקרה של ${ils(brand.targetCpReg)}` : ""}.`);

  const wins: string[] = [];
  const bestSec = app.filter((s) => s.totals.registrations > 0)
    .sort((a, b) => (a.totals.spend / a.totals.registrations) - (b.totals.spend / b.totals.registrations))[0];
  if (bestSec && app.length > 1) wins.push(`המקטע היעיל: ${bestSec.title}, הרשמה ב-${ils(bestSec.totals.spend / bestSec.totals.registrations)}.`);
  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}

/** Per-platform media-plan clients (Chery, Xpeng) — plan attainment across Meta/TikTok/YouTube. */
export function buildPlanClientConclusions(
  brand: BrandConfig, periodLabel: string, e: PlatformPlanExecution, insights: Insight[],
  feedback?: Record<string, InsightFeedback>, changes?: AccountChanges | null,
): ClientConclusionsDraft {
  const T = e.totals;
  const headline = [`בתקופת ${periodLabel} הושקעו ${ils(T.totalSpend)} מתוך פריסה של ${ils(T.budget)} (${pct(T.spendPct ?? 0)}), שייצרו ${n0i(T.thruplay)} צפיות ${n0i(T.completedViews)} מהן צפיות מלאות.`];
  if (T.cpCompleted != null) headline.push(`עלות לצפייה מלאה ${ils3(T.cpCompleted)}${T.planCpCompleted ? ` מול יעד ${ils3(T.planCpCompleted)}` : ""}.`);

  const wins: string[] = [];
  const byCp = e.lines.filter((l) => l.actual.completedViews > 0)
    .map((l) => ({ t: l.line.title, cp: l.actual.spend / l.actual.completedViews }))
    .sort((a, b) => a.cp - b.cp);
  if (byCp[0]) wins.push(`הערוץ היעיל בתקופה: ${byCp[0].t}, צפייה מלאה ב-${ils3(byCp[0].cp)}.`);
  const beat = e.lines.filter((l) => (l.completedPct ?? 0) >= 1).map((l) => l.line.title);
  if (beat.length) wins.push(`${beat.join(" ו-")} עברו את יעד הצפיות המלאות בפריסה.`);
  const topVideo = [...e.youtubeVideos].filter((v) => (v.completionRate ?? 0) > 0).sort((a, b) => (b.completionRate ?? 0) - (a.completionRate ?? 0))[0];
  if (topVideo) wins.push(`התוכן עם שיעור הסיום הגבוה ביותר: "${topVideo.title}" (${pct(topVideo.completionRate ?? 0)}).`);

  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}

/** Search share-of-voice clients (Colgate). */
export function buildImpshareClientConclusions(
  brand: BrandConfig, periodLabel: string, sections: SnapSection[], insights: Insight[],
  feedback?: Record<string, InsightFeedback>, changes?: AccountChanges | null,
): ClientConclusionsDraft {
  const live = sections.filter((s) => s.totals.impressions > 0);
  const spend = live.reduce((a, s) => a + s.totals.cost, 0);
  const headline = [`בתקופת ${periodLabel} הושקעו ${ils(spend)} בחיפוש על פני ${live.length} חשבונות.`];

  const wins: string[] = [];
  for (const s of live.sort((a, b) => (b.totals.impShare ?? 0) - (a.totals.impShare ?? 0)).slice(0, 3)) {
    if (s.totals.impShare != null) wins.push(`${s.title}: נוכחות ${pct(s.totals.impShare)} מהחיפושים הרלוונטיים.`);
  }
  return composeDraft({ brand, headline, wins, insights, feedback, changes });
}
