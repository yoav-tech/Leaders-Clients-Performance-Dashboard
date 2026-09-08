// Conclusions and recommendations for the monthly client emails.
//
// Every rule here has to clear one bar: it names a specific thing to do and quantifies what doing
// it is worth. "CPV is above target" is a reading, not a recommendation — "move ₪6,854 out of
// מעלות and חריש into ירושלים and the same money buys 160 more registrations" is one. Rules that
// can't be quantified from the data are left out rather than padded with generalities.
import type { BrandConfig } from "./brands";
import type { CampBrandMetrics } from "./campaignMetrics";
import type { AppReport } from "./appReport";
import type { ClientReport } from "./clientReport";
import type { SnapSection } from "./searchSnapshot";
import type { TopProductsResult } from "./topProducts";
import { playbookFor, rampDays } from "./playbooks";

export type Severity = "critical" | "warn" | "good";
export interface Insight { severity: Severity; title: string; evidence: string; action: string }

const ils = (v: number | null | undefined) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const ils2 = (v: number | null | undefined) => (v == null ? "—" : `₪${v.toFixed(3)}`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const pctv = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

// Ranked worst-first so the reader meets the thing that needs a decision.
const RANK: Record<Severity, number> = { critical: 0, warn: 1, good: 2 };
const order = (a: Insight[]) => a.sort((x, y) => RANK[x.severity] - RANK[y.severity]).slice(0, 6);

/** What the same money would return if spent at a better unit cost. The core recommendation shape. */
function shiftGain(spend: number, unitsNow: number, betterUnitCost: number): number {
  if (betterUnitCost <= 0) return 0;
  return Math.max(0, spend / betterUnitCost - unitsNow);
}

// ─────────────────────────────────────────── video / awareness
export function viewsInsights(
  brand: BrandConfig,
  m: CampBrandMetrics,
  opts?: { ads?: { name: string; spend: number; views: number; cpv: number | null }[]; leads?: { leads: number; cpl: number | null; targetLeads: number; targetCpa: number }; planPct?: number | null; elapsedPct?: number | null },
): Insight[] {
  const out: Insight[] = [];
  const t = m.total;
  const target = brand.targetCpv ?? null;

  if (target != null && t.cpv != null) {
    const over = (t.cpv / target - 1) * 100;
    if (t.cpv > target) {
      // What the current spend would have bought at target price.
      const wouldBuy = t.spend / target;
      out.push({
        severity: over > 25 ? "critical" : "warn",
        title: `עלות הצפייה גבוהה מהיעד ב-${Math.round(over)}%`,
        evidence: `${ils2(t.cpv)} מול יעד ${ils2(target)}. באותה הוצאה (${ils(t.spend)}) יעד זה היה מניב ${n0(wouldBuy)} צפיות במקום ${n0(t.views)}.`,
        action: `להעביר תקציב לקריאייטיב ולפלטפורמה עם העלות הנמוכה ביותר, ולעצור קווים שמעל ${ils2(target * 1.3)}.`,
      });
    } else {
      out.push({
        severity: "good",
        title: "עלות הצפייה מתחת ליעד",
        evidence: `${ils2(t.cpv)} מול יעד ${ils2(target)}.`,
        action: `יש מרווח להגדיל נפח: הוספת ${ils(t.spend * 0.2)} צפויה להוסיף כ-${n0((t.spend * 0.2) / t.cpv)} צפיות במחיר הנוכחי.`,
      });
    }
  }

  // Platform spread — the single most actionable lever in a multi-platform buy.
  const chans = m.channels.filter((c) => c.channel !== "total" && c.views > 0 && c.cpv != null);
  if (chans.length >= 2) {
    const best = chans.reduce((a, b) => ((a.cpv ?? 9e9) <= (b.cpv ?? 9e9) ? a : b));
    const worst = chans.reduce((a, b) => ((a.cpv ?? 0) >= (b.cpv ?? 0) ? a : b));
    const gapPct = best.cpv ? (worst.cpv! / best.cpv - 1) * 100 : 0;
    if (gapPct >= 20) {
      const move = worst.spend * 0.3;
      const gain = shiftGain(move, move / worst.cpv!, best.cpv!);
      out.push({
        severity: gapPct >= 60 ? "critical" : "warn",
        title: `פער של ${Math.round(gapPct)}% בעלות הצפייה בין הפלטפורמות`,
        evidence: `${best.channel} מספקת צפייה ב-${ils2(best.cpv)} מול ${ils2(worst.cpv)} ב-${worst.channel}.`,
        action: `להעביר ${ils(move)} (30% מתקציב ${worst.channel}) ל-${best.channel} — כ-${n0(gain)} צפיות נוספות באותו כסף.`,
      });
    }
  }

  // Creative spread inside the account.
  const ads = (opts?.ads ?? []).filter((a) => a.cpv != null && a.views > 0);
  if (ads.length >= 3) {
    const best = ads.reduce((a, b) => (a.cpv! <= b.cpv! ? a : b));
    const worst = ads.reduce((a, b) => (a.cpv! >= b.cpv! ? a : b));
    if (best.cpv! > 0 && worst.cpv! / best.cpv! >= 2) {
      const gain = shiftGain(worst.spend, worst.views, best.cpv!);
      out.push({
        severity: "warn",
        title: "פער גדול בין הקריאייטיבים",
        evidence: `"${worst.name}" מייצר צפייה ב-${ils2(worst.cpv)} בעוד "${best.name}" ב-${ils2(best.cpv)} — פי ${(worst.cpv! / best.cpv!).toFixed(1)}.`,
        action: `לעצור את "${worst.name}" ולהסיט את ${ils(worst.spend)} שלו למוביל — כ-${n0(gain)} צפיות נוספות.`,
      });
    }
  }

  // Flight pacing against the plan.
  if (opts?.planPct != null && opts.elapsedPct != null && opts.elapsedPct > 15) {
    const behind = opts.elapsedPct - opts.planPct;
    if (behind >= 10) {
      out.push({
        severity: behind >= 25 ? "critical" : "warn",
        title: `הפריסה מפגרת אחרי לוח הזמנים ב-${Math.round(behind)} נקודות`,
        evidence: `עברו ${Math.round(opts.elapsedPct)}% מהתקופה, הושגו ${Math.round(opts.planPct)}% מיעד הצפיות.`,
        action: "להגדיל תקציב יומי בקווים שמפגרים, או להעביר יעד צפיות לקווים שמספקים מתחת ליעד העלות.",
      });
    }
  }

  if (opts?.leads) {
    const L = opts.leads;
    const pct = L.targetLeads ? (L.leads / L.targetLeads) * 100 : null;
    if (pct != null && pct < 90) {
      const missing = L.targetLeads - L.leads;
      out.push({
        severity: pct < 60 ? "critical" : "warn",
        title: `חסרים ${n0(missing)} לידים ליעד`,
        evidence: `${n0(L.leads)} מתוך ${n0(L.targetLeads)} (${Math.round(pct)}%), בעלות ${ils(L.cpl)} לליד מול יעד ${ils(L.targetCpa)}.`,
        action: L.cpl != null && L.cpl <= L.targetCpa
          ? `העלות עומדת ביעד, כלומר החסם הוא נפח: תוספת של ${ils(missing * L.cpl)} לקמפיינים הייעודיים תסגור את הפער.`
          : "העלות לליד מעל היעד — לחדד קהלים וקריאייטיב לפני הגדלת תקציב.",
      });
    }
  }
  return order(out);
}

// ─────────────────────────────────────────── app (Haat)
export function appInsights(
  brand: BrandConfig,
  r: AppReport,
  cities?: { city: string; spend: number; regs: number; cpr: number }[],
): Insight[] {
  const out: Insight[] = [];
  const ceiling = brand.targetCpReg ?? null;
  const app = r.sections.filter((s) => s.kind === "app");
  const spend = app.reduce((a, s) => a + s.totals.spend, 0);
  const regs = app.reduce((a, s) => a + s.totals.registrations, 0);
  const installs = app.reduce((a, s) => a + s.totals.installs, 0);
  const cpReg = regs ? spend / regs : null;

  if (ceiling != null && cpReg != null) {
    out.push(cpReg <= ceiling
      ? { severity: "good", title: "עלות ההרשמה עומדת ביעד", evidence: `${ils(cpReg)} מול תקרה של ${ils(ceiling)}.`,
          action: `יש מרווח של ${ils(ceiling - cpReg)} להרשמה — אפשר להגדיל נפח בערים שמתחת לתקרה.` }
      : { severity: "critical", title: "עלות ההרשמה חורגת מהתקרה", evidence: `${ils(cpReg)} מול תקרה של ${ils(ceiling)}.`,
          action: "לצמצם תקציב בערים היקרות ולהסיטו לזולות — פירוט בהמלצה הבאה." });
  }

  // The reallocation recommendation — the most concrete thing we can say.
  if (ceiling != null && cities?.length) {
    const over = cities.filter((c) => c.cpr > ceiling);
    const under = cities.filter((c) => c.cpr <= ceiling).sort((a, b) => a.cpr - b.cpr);
    if (over.length && under.length) {
      const best = under[0];
      const spendAtRisk = over.reduce((a, c) => a + c.spend, 0);
      const regsNow = over.reduce((a, c) => a + c.regs, 0);
      const gain = shiftGain(spendAtRisk, regsNow, best.cpr);
      out.push({
        severity: "critical",
        title: `${over.length} ערים מעל תקרת ה-${ils(ceiling)}`,
        evidence: `${over.map((c) => `${c.city} ${ils(c.cpr)}`).join(", ")} — יחד ${ils(spendAtRisk)} שהניבו ${n0(regsNow)} הרשמות.`,
        action: `להסיט את ${ils(spendAtRisk)} ל${best.city} (${ils(best.cpr)} להרשמה) — כ-${n0(gain)} הרשמות נוספות באותו תקציב.`,
      });
    }
    const cheap = cities.filter((c) => ceiling > 0 && c.cpr <= ceiling * 0.6).sort((a, b) => a.cpr - b.cpr);
    if (cheap.length) {
      out.push({
        severity: "good",
        title: "ערים עם מרווח להגדלה",
        evidence: `${cheap.slice(0, 3).map((c) => `${c.city} ${ils(c.cpr)}`).join(", ")} — הרבה מתחת לתקרה.`,
        action: `להגדיל בהן תקציב: כל ${ils(1000)} נוספים ב${cheap[0].city} שווים כ-${n0(1000 / cheap[0].cpr)} הרשמות.`,
      });
    }
  }

  if (installs > 0 && regs > 0) {
    const rate = regs / installs;
    if (rate < 0.45) {
      out.push({
        severity: "warn",
        title: `רק ${pctv(rate)} מההתקנות הופכות להרשמה`,
        evidence: `${n0(installs)} התקנות ייצרו ${n0(regs)} הרשמות.`,
        action: `שיפור השלב הזה ל-55% היה מוסיף כ-${n0(installs * 0.55 - regs)} הרשמות באותו תקציב — לבדוק את מסך ההרשמה והאונבורדינג.`,
      });
    }
  }
  return order(out);
}

// ─────────────────────────────────────────── e-commerce
export function ecomInsights(
  brand: BrandConfig,
  r: ClientReport,
  products?: TopProductsResult | null,
  audience?: { newRevenue: number; storeRevenue: number },
): Insight[] {
  const out: Insight[] = [];
  const pb = playbookFor(brand.id);
  const paidRoas = r.topLevel.paidRoas;
  const siteRoas = r.topLevel.siteRoas;
  const spend = r.topLevel.totalSpend;

  // 1. The floor the account is actually judged on. Site ROAS counts revenue paid media didn't
  //    create, so a healthy-looking 5.1 can sit on top of a paid ROAS scraping its floor.
  if (pb?.paidRoasFloor != null && paidRoas != null) {
    const floor = pb.paidRoasFloor;
    const margin = (paidRoas / floor - 1) * 100;
    if (paidRoas < floor) {
      out.push({
        severity: "critical",
        title: `הרואס הממומן מתחת לרצפה של ${floor}`,
        evidence: `${paidRoas.toFixed(2)} מול רצפה ${floor.toFixed(1)}${siteRoas != null ? `. רואס האתר ${siteRoas.toFixed(2)} גבוה יותר אבל הוא כולל הכנסות שהמדיה לא ייצרה` : ""}.`,
        action: "לעצור קמפיינים מתחת לרצפה ולהסיט את תקציבם למובילים לפני כל הגדלה.",
      });
    } else if (margin < 15) {
      out.push({
        severity: "warn",
        title: `הרואס הממומן ${paidRoas.toFixed(2)} — רק ${Math.round(margin)}% מעל הרצפה`,
        evidence: `הרצפה היא ${floor.toFixed(1)}${siteRoas != null ? `; רואס האתר ${siteRoas.toFixed(2)} מטעה כאן כי הוא סופר גם הכנסות שאינן מהמדיה` : ""}.`,
        action: "אין מרווח להגדלה רוחבית. קודם לשפר יעילות במודעות החלשות, ורק אז לשקול תקציב.",
      });
    }
  }

  // 2. Audience mix — the account is judged on new customers, not revenue alone.
  if (pb?.newCustomerShareTarget != null && audience && audience.storeRevenue > 0) {
    const share = audience.newRevenue / audience.storeRevenue;
    if (share > 0 && share < pb.newCustomerShareTarget) {
      const gap = pb.newCustomerShareTarget - share;
      out.push({
        severity: gap > 0.2 ? "critical" : "warn",
        title: `${Math.round(share * 100)}% מההכנסות מקהל חדש, מול יעד ${Math.round(pb.newCustomerShareTarget * 100)}%`,
        evidence: `${ils(audience.newRevenue)} מתוך ${ils(audience.storeRevenue)} — השאר מקהל חוזר.`,
        action: `להסיט משקל לקהלים קרים ולקריאייטיב גיוס: סגירת הפער שווה כ-${ils(gap * audience.storeRevenue)} הכנסות מלקוחות חדשים.`,
      });
    }
  }

  // 3. Efficient-but-small channel. Never a scale instruction on its own — the playbook's checks
  //    decide whether the efficiency is repeatable or the echo of something already over.
  const plats = r.platforms.filter((p) => p.spend > 0 && p.roas != null);
  if (plats.length >= 2 && pb) {
    const best = plats.reduce((a, b) => (a.roas! >= b.roas! ? a : b));
    const biggest = plats.reduce((a, b) => (a.spend >= b.spend ? a : b));
    if (best.platform !== biggest.platform && best.roas! >= biggest.roas! * 1.5) {
      const cur = best.spend / 30;
      const tgt = cur * 2;
      const days = rampDays(cur, tgt, pb.maxDailyBudgetChange);
      out.push({
        severity: "good",
        title: `${best.platform} מחזיר ${best.roas!.toFixed(2)} על ${ils(best.spend)} בלבד`,
        evidence: `${biggest.platform} מחזיר ${biggest.roas!.toFixed(2)} על ${ils(biggest.spend)}. הפער מצדיק בדיקה — לא הגדלה אוטומטית.`,
        action: `לפני הגדלה לענות: ${pb.scaleChecks.join(" · ")} אם התשובה מצדיקה — הכפלה של ${best.platform} דורשת ${days} ימי העלאה הדרגתית (עד ${Math.round(pb.maxDailyBudgetChange * 100)}% ליום, מעבר לכך הקמפיין חוזר ללמידה).`,
      });
    }
  }

  // 4. Creative spread — the cheapest lever, and it doesn't touch budget caps.
  const ads = r.topAds.filter((a) => a.spend > 0 && a.roas != null);
  if (ads.length >= 3) {
    const best = ads.reduce((a, b) => (a.roas! >= b.roas! ? a : b));
    const worst = ads.reduce((a, b) => (a.roas! <= b.roas! ? a : b));
    if (best.roas! > 0 && best.roas! / Math.max(worst.roas!, 0.1) >= 2.5) {
      const gain = worst.spend * (best.roas! - worst.roas!);
      out.push({
        severity: "warn",
        title: "פער גדול בין המודעות המובילות",
        evidence: `"${best.name}" ברואס ${best.roas!.toFixed(1)} מול "${worst.name}" ב-${worst.roas!.toFixed(1)}.`,
        action: `להסיט את ${ils(worst.spend)} מהחלשה למובילה — פוטנציאל של כ-${ils(gain)} הכנסות. שינוי קריאייטיב אינו כפוף למגבלת התקציב היומית.`,
      });
    }
  }

  // 5. Attribution gap — Meta claiming credit the store doesn't confirm.
  const withStore = r.topAds.filter((a) => a.roas != null && a.storeRoas != null && a.storeRoas > 0);
  if (withStore.length >= 3) {
    const metaSum = withStore.reduce((a, x) => a + x.roas!, 0);
    const storeSum = withStore.reduce((a, x) => a + x.storeRoas!, 0);
    const ratio = storeSum > 0 ? metaSum / storeSum : null;
    if (ratio != null && ratio >= 1.5) {
      out.push({
        severity: "warn",
        title: `מטא מדווחת רואס גבוה פי ${ratio.toFixed(1)} מהחנות`,
        evidence: `על ${withStore.length} המודעות המובילות, הרואס לפי מטא גבוה בעקביות מהרואס לפי הכנסות החנות בפועל.`,
        action: "לתקצב לפי רואס החנות ולא לפי הדיווח של מטא — ההפרש הוא קרדיט שמטא לוקחת על מכירות שלא לגמרי שלה.",
      });
    }
  }

  // 6. Influencer vs brand creative. The commission is invisible to every platform's ROAS, so an
  //    influencer looks cheaper than she is — and if only her creative converts, the brand is
  //    paying that commission on most of its sales.
  const cs = r.creativeSplit;
  if (cs && pb?.influencerCommission && cs.influencerSpend > 0 && cs.brandSpend > 0) {
    const vat = 1 + (pb.vatRate ?? 0);
    const commission = cs.influencerRevenue * pb.influencerCommission * vat;
    const inflRoas = cs.influencerRevenue / cs.influencerSpend;
    const netInflRoas = cs.influencerRevenue / (cs.influencerSpend + commission);
    const brandRoas = cs.brandRevenue / cs.brandSpend;
    const totalRev = cs.influencerRevenue + cs.brandRevenue;
    const inflShare = totalRev ? cs.influencerRevenue / totalRev : 0;
    const spendShare = cs.brandSpend / (cs.influencerSpend + cs.brandSpend);

    if (netInflRoas > brandRoas) {
      // The brand's own creative is the weak side — that is the thing to fix.
      const uplift = cs.brandSpend * (netInflRoas - brandRoas);
      out.push({
        severity: inflShare > 0.5 ? "critical" : "warn",
        title: `קריאייטיב המותג מחזיר ${brandRoas.toFixed(2)} מול ${netInflRoas.toFixed(2)} של המשפיעניות אחרי עמלה`,
        evidence: `${Math.round(spendShare * 100)}% מהתקציב יושב בקריאייטיב מותג שמחזיר פחות. המשפיעניות מדווחות ${inflRoas.toFixed(2)} אבל העמלה (${Math.round(pb.influencerCommission * 100)}% + מע״מ, ${ils(commission)} החודש) מורידה אותן ל-${netInflRoas.toFixed(2)}.`,
        action: `לדרוש מהלקוח קריאייטיב מותג חדש — אם הוא היה מגיע ליעילות של המשפיעניות, אותו תקציב היה מניב כ-${ils(uplift)} הכנסות נוספות. תלות במשפיענית עולה ${Math.round(pb.influencerCommission * 100)}% על כל המרה.`,
      });
    } else {
      out.push({
        severity: "good",
        title: `אחרי עמלה, קריאייטיב המותג יעיל יותר (${brandRoas.toFixed(2)} מול ${netInflRoas.toFixed(2)})`,
        evidence: `המשפיעניות מדווחות ${inflRoas.toFixed(2)}, אבל ${ils(commission)} עמלה החודש מורידים אותן מתחת למותג.`,
        action: "להסיט משקל לקריאייטיב המותג — אותה תוצאה בלי עמלה.",
      });
    }
  }

  if (products?.rows?.length && products.storeRevenue) {
    const top3 = products.rows.slice(0, 3).reduce((a, p) => a + p.revenue, 0);
    const share = top3 / products.storeRevenue;
    if (share > 0.5) {
      out.push({
        severity: "warn",
        title: `${pctv(share)} מהמכירות מרוכזות ב-3 מוצרים`,
        evidence: `${products.rows.slice(0, 3).map((p) => p.name).join(", ")}.`,
        action: "ריכוז גבוה הוא סיכון: להריץ קמפיין ייעודי למוצר רביעי עם ביקוש מוכח כדי לפזר את התלות.",
      });
    }
  }
  return order(out);
}

// ─────────────────────────────────────────── leads
export function leadsInsights(brand: BrandConfig, m: CampBrandMetrics): Insight[] {
  const out: Insight[] = [];
  const t = m.total;
  const target = brand.targetCpl ?? null;
  const budget = brand.monthlyBudget ?? 0;

  if (target != null && t.cpl != null) {
    if (t.cpl > target) {
      const wouldBuy = t.spend / target;
      out.push({
        severity: t.cpl > target * 1.3 ? "critical" : "warn",
        title: `עלות הליד גבוהה מהיעד ב-${Math.round((t.cpl / target - 1) * 100)}%`,
        evidence: `${ils(t.cpl)} מול יעד ${ils(target)}. באותה הוצאה יעד זה היה מניב ${n0(wouldBuy)} לידים במקום ${n0(t.leads)}.`,
        action: "לעצור את הפלטפורמה או הקמפיין עם ה-CPL הגבוה ולהסיט את תקציבו למוביל.",
      });
    } else {
      out.push({
        severity: "good", title: "עלות הליד עומדת ביעד",
        evidence: `${ils(t.cpl)} מול יעד ${ils(target)}.`,
        action: `יש מרווח להגדיל נפח: תוספת של ${ils(budget * 0.2)} שווה כ-${n0((budget * 0.2) / t.cpl)} לידים במחיר הנוכחי.`,
      });
    }
  }

  const chans = m.channels.filter((c) => c.channel !== "total" && c.leads > 0 && c.cpl != null);
  if (chans.length >= 2) {
    const best = chans.reduce((a, b) => ((a.cpl ?? 9e9) <= (b.cpl ?? 9e9) ? a : b));
    const worst = chans.reduce((a, b) => ((a.cpl ?? 0) >= (b.cpl ?? 0) ? a : b));
    if (best.cpl! > 0 && worst.cpl! / best.cpl! >= 1.3) {
      const move = worst.spend * 0.3;
      const gain = shiftGain(move, move / worst.cpl!, best.cpl!);
      out.push({
        severity: "warn",
        title: `${best.channel} מייצרת לידים זולים ב-${Math.round((1 - best.cpl! / worst.cpl!) * 100)}% מ-${worst.channel}`,
        evidence: `${ils(best.cpl)} מול ${ils(worst.cpl)} לליד.`,
        action: `להעביר ${ils(move)} מ-${worst.channel} ל-${best.channel} — כ-${n0(gain)} לידים נוספים באותו כסף.`,
      });
    }
  }

  if (budget > 0 && t.spend < budget * 0.8) {
    const unspent = budget - t.spend;
    out.push({
      severity: "warn",
      title: `${pctv(unspent / budget)} מהתקציב לא נוצל`,
      evidence: `הוצאו ${ils(t.spend)} מתוך ${ils(budget)}.`,
      action: t.cpl != null ? `ניצול מלא במחיר הנוכחי היה מוסיף כ-${n0(unspent / t.cpl)} לידים.` : "לבדוק מגבלות תקציב יומי או אישורי מודעות.",
    });
  }
  return order(out);
}

// ─────────────────────────────────────────── search share of voice
export function impShareInsights(brand: BrandConfig, sections: SnapSection[]): Insight[] {
  const out: Insight[] = [];
  for (const s of sections) {
    const T = s.totals;
    if (!T.impressions) continue;
    const lostBudget = T.lostBudget ?? 0;
    const lostRank = T.lostRank ?? 0;
    const is = T.impShare ?? 0;
    if (lostBudget > 0.25 && is > 0) {
      // Cost per point of presence, from this account's own spend.
      const perPoint = T.cost / (is * 100);
      const toHalf = Math.max(0, 50 - is * 100) * perPoint;
      out.push({
        severity: lostBudget > 0.5 ? "critical" : "warn",
        title: `${s.title}: ${pctv(lostBudget)} מהחשיפות אבדו בגלל תקציב`,
        evidence: `נוכחות ${pctv(is)} בלבד, ורק ${pctv(lostRank)} אבדו בגלל דירוג — כלומר המודעות מנצחות, נגמר התקציב.`,
        action: `כל נקודת נוכחות עולה כ-${ils(perPoint)} בחודש. הגעה ל-50% דורשת תוספת של כ-${ils(toHalf)} בחודש.`,
      });
    } else if (lostRank > 0.25) {
      out.push({
        severity: "warn",
        title: `${s.title}: ${pctv(lostRank)} מהחשיפות אבדו בגלל דירוג`,
        evidence: `אובדן התקציב הוא ${pctv(lostBudget)} בלבד — התקציב מספיק, הדירוג לא.`,
        action: "כאן תקציב לא יעזור: לשפר רלוונטיות מודעה, עמוד נחיתה ומבנה מילות מפתח.",
      });
    }
    const failing = s.rows.filter((r) => r.pass === false && r.impressions > 0);
    if (failing.length) {
      out.push({
        severity: "warn",
        title: `${s.title}: ${failing.length} סוגי קמפיין מתחת ליעד הנוכחות`,
        evidence: failing.map((r) => `${r.type} ${pctv(r.impShare)}`).join(", "),
        action: "להגדיל תקציב יומי בקמפיינים האלה, או לאחד אותם לקמפיין ממומן היטב במקום כמה חלשים.",
      });
    }
  }
  return order(out);
}
