// Findings for the per-platform media-plan brands (Chery, Xpeng).
//
// These two don't fit the generic views rules. Their report is built around a signed plan with a
// budget and view targets per platform, a YouTube line measured on TrueView rather than 15-second
// views, and a separate lead goal — so the findings have to be read off the plan execution, not off
// the blended campaign metrics every other views brand uses.
//
// Cost per completed view carries most of the weight here. It is the one figure defined identically
// on Meta, TikTok and YouTube, and the plan prices the flight on it, so it is the only number that
// can be compared across platforms and against what was sold.
import type { BrandConfig } from "./brands";
import type { PlatformPlanExecution } from "./platformPlan";
import type { Insight } from "./reportInsights";

const ils = (v: number) => `₪${Math.round(v).toLocaleString("en-US")}`;
const ils3 = (v: number) => `₪${v.toFixed(3)}`;
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${Math.round(v * 100)}%`;

// A reallocation claim is only worth making about money that could plausibly move. Valuing a whole
// platform's budget at another's price produces a true division and an untrue statement — Chery's
// TikTok line came out as "1.46m more completed views", which is the entire flight restaged. The
// gain is quoted on a 30% shift, the same ceiling the other rules already use.
const SHIFT = 0.3;

export function planInsights(brand: BrandConfig, e: PlatformPlanExecution): Insight[] {
  const out: Insight[] = [];
  const T = e.totals;
  const elapsed = e.totalDays > 0 ? e.elapsedDays / e.totalDays : 0;

  // 1. The price the flight was sold on.
  if (T.cpCompleted != null && T.planCpCompleted != null) {
    const ratio = T.planCpCompleted / T.cpCompleted;
    out.push({
      id: "plan-cost-per-completed",
      data: { actual: T.cpCompleted, plan: T.planCpCompleted, ratio, completed: T.completedViews, spend: T.spend },
      severity: T.cpCompleted <= T.planCpCompleted ? "good" : "critical",
      title: `עלות לצפייה מלאה ${ils3(T.cpCompleted)} מול יעד ${ils3(T.planCpCompleted)}`,
      evidence: `${n0(T.completedViews)} צפיות מלאות על ${ils(T.spend)} הוצאת צפיות.`,
      action: T.cpCompleted <= T.planCpCompleted
        ? `היעד מושג פי ${ratio.toFixed(1)} — יש מרווח להרחיב נפח בערוץ היעיל ביותר.`
        : "לרכז תקציב בערוץ עם העלות הנמוכה ביותר לצפייה מלאה.",
    });
  }

  // 2. The spread between platforms, on the one metric that compares.
  const withCompleted = e.lines
    .filter((l) => l.actual.completedViews > 0)
    .map((l) => ({ title: l.line.title, cp: l.actual.spend / l.actual.completedViews, spend: l.actual.spend, completed: l.actual.completedViews }));
  if (withCompleted.length >= 2) {
    const best = withCompleted.reduce((a, b) => (a.cp <= b.cp ? a : b));
    const worst = withCompleted.reduce((a, b) => (a.cp >= b.cp ? a : b));
    if (best.cp > 0 && worst.cp / best.cp >= 1.5) {
      // What the weakest platform's money would have bought at the best platform's price.
      const move = worst.spend * SHIFT;
      const gain = Math.max(0, move / best.cp - (worst.completed * SHIFT));
      out.push({
        id: "platform-completed-gap",
        data: { bestCp: best.cp, worstCp: worst.cp, ratio: worst.cp / best.cp, worstSpend: worst.spend, move, gain },
        severity: worst.cp / best.cp >= 3 ? "critical" : "warn",
        title: `פער של פי ${(worst.cp / best.cp).toFixed(1)} בעלות לצפייה מלאה בין הפלטפורמות`,
        evidence: `${best.title} ${ils3(best.cp)} מול ${worst.title} ${ils3(worst.cp)}.`,
        action: `העברת ${ils(move)} (30% מתקציב ${worst.title}) ל${best.title} שווה כ-${n0(gain)} צפיות מלאות נוספות.`,
        labels: { best: best.title, worst: worst.title },
      });
    }
  }

  // 3. YouTube by ad format. A TrueView view is a different event per format, so the comparison that
  //    means anything is the completed view — and on Chery the two formats are an order apart.
  const fmts = e.youtubeFormats.filter((f) => f.completedViews > 0 && f.cpCompleted != null);
  if (fmts.length >= 2) {
    const best = fmts.reduce((a, b) => (a.cpCompleted! <= b.cpCompleted! ? a : b));
    const worst = fmts.reduce((a, b) => (a.cpCompleted! >= b.cpCompleted! ? a : b));
    if (best.cpCompleted! > 0 && worst.cpCompleted! / best.cpCompleted! >= 2) {
      const move = worst.spend * SHIFT;
      const gain = Math.max(0, move / best.cpCompleted! - (worst.completedViews * SHIFT));
      out.push({
        id: "youtube-format-gap",
        data: { bestCp: best.cpCompleted!, worstCp: worst.cpCompleted!, ratio: worst.cpCompleted! / best.cpCompleted!, worstSpend: worst.spend, move, gain },
        severity: "warn",
        title: `ביוטיוב, ${best.label} מייצר צפייה מלאה פי ${(worst.cpCompleted! / best.cpCompleted!).toFixed(1)} זול מ-${worst.label}`,
        evidence: `${ils3(best.cpCompleted!)} מול ${ils3(worst.cpCompleted!)}, על ${ils(worst.spend)} שהושקעו ב-${worst.label}.`,
        action: `העברת ${ils(move)} (30% מתקציב ${worst.label}) ל-${best.label} שווה כ-${n0(gain)} צפיות מלאות נוספות.`,
        labels: { best: best.label, worst: worst.label },
      });
    }
  }

  // 4. Budget pacing against the flight's own clock. The plan funds the whole account, so this is
  //    total spend — views and leadgen together.
  if (T.spendPct != null && elapsed > 0.15) {
    const behind = elapsed - T.spendPct;
    if (Math.abs(behind) >= 0.1) {
      const left = Math.max(0, T.budget - T.totalSpend);
      const daysLeft = Math.max(1, e.totalDays - e.elapsedDays);
      out.push({
        id: "plan-budget-pace",
        data: { spendPct: T.spendPct, elapsedPct: elapsed, left, daysLeft, perDay: left / daysLeft },
        severity: behind >= 0.2 ? "warn" : "good",
        title: behind > 0 ? `ניצול התקציב ${pct(T.spendPct)} מול ${pct(elapsed)} מהזמן` : `ניצול התקציב ${pct(T.spendPct)}, מקדים את לוח הזמנים`,
        evidence: `${ils(left)} נותרו ל-${n0(daysLeft)} ימים.`,
        action: `לסיום מלא נדרשים ${ils(left / daysLeft)} ליום.`,
      });
    }
  }

  // 5. The lead goal, where the plan carries one.
  const lt = brand.platformPlan?.leadTarget;
  if (lt && e.leads.length) {
    const leads = e.leads.reduce((a, r) => a + r.leads, 0);
    const lgLeads = e.leads.reduce((a, r) => a + r.leadgenLeads, 0);
    const lgSpend = e.leads.reduce((a, r) => a + r.leadgenSpend, 0);
    const cpl = lgLeads ? lgSpend / lgLeads : null;
    if (cpl != null) {
      out.push({
        id: "plan-lead-goal",
        data: { leads, target: lt.leads, pct: leads / lt.leads, cpl, targetCpa: lt.cpa, bonus: leads - lgLeads },
        severity: cpl <= lt.cpa ? "good" : "warn",
        title: `${n0(leads)} לידים מתוך יעד ${n0(lt.leads)}, בעלות ${ils(cpl)} לליד`,
        evidence: `יעד העלות ${ils(lt.cpa)}. ${n0(leads - lgLeads)} מההמרות הגיעו מקמפייני צפיות כבונוס ואינן נכללות בעלות.`,
        action: cpl <= lt.cpa
          ? `העלות מתחת ליעד — סגירת הפער ל-${n0(lt.leads)} במחיר הנוכחי עולה כ-${ils(Math.max(0, lt.leads - leads) * cpl)}.`
          : "לרכז את תקציב הלידים בפלטפורמה עם העלות הנמוכה ולעצור את היקרה.",
      });
    }
  }

  const RANK = { critical: 0, warn: 1, good: 2 } as const;
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, 6);
}
