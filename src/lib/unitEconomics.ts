// ============================================================================================
// יוניט אקונומיקס — where an ecommerce client's ROAS target actually comes from
// ============================================================================================
//
// A ROAS target is not a media opinion. It is arithmetic on the client's own economics: what a
// product costs, what an order costs to fulfil, and how much of the contribution the client is
// willing to spend on acquiring it. `targetRoas: 3` typed into a config file is a guess; this
// derives the number instead, and shows the working.
//
// Collected from the client BEFORE the first plan is built, and re-confirmed when prices,
// shipping or margins move.
import { MIN_TARGET_ROAS } from "./mediaPlanRules";

export interface UnitEconomics {
  aov: number; // ממוצע הזמנה (₪), ללא מע״מ
  grossMarginPct: number; // 0..1 — (הכנסה − עלות המוצר) ÷ הכנסה
  shippingPerOrder: number; // ₪ — עלות המשלוח שהמותג סופג בפועל
  paymentFeePct: number; // 0..1 — עמלת סליקה
  otherVariablePerOrder: number; // ₪ — ליקוט, אריזה, כל עלות משתנה אחרת
  // What share of the contribution the client wants to KEEP as profit rather than spend on ads.
  // 0 = spend it all (break-even), 0.3 = keep 30%.
  targetProfitShare: number; // 0..1
  // Contribution over the customer's lifetime vs the first order. 1 = no repeat value counted.
  // Only raise it when repeat purchase is measured, not hoped for.
  ltvMultiple: number; // ≥ 1
  collectedAt?: string; // ISO date the client confirmed these
  source?: string; // who supplied them
  notes?: string;
}

export interface DerivedEconomics {
  contributionPerOrder: number; // ₪ left per order before any ad spend
  contributionMarginPct: number; // that, as a share of AOV
  breakEvenRoas: number; // the ROAS at which ads exactly consume the contribution
  breakEvenCac: number; // ₪ — the most an order may cost to acquire, at break-even
  targetRoas: number; // the goal, after keeping targetProfitShare and counting LTV
  targetCac: number; // ₪ — the CAC that target implies
  floorApplied: boolean; // the derived target came out below MIN_TARGET_ROAS and was raised
  viable: boolean; // false when the economics leave nothing to spend on ads
  warnings: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// Sanity bounds — a value outside these is a data-entry mistake, not a business model.
export const ECONOMICS_BOUNDS = {
  aov: { min: 20, max: 5000 },
  grossMarginPct: { min: 0.05, max: 0.95 },
  paymentFeePct: { min: 0, max: 0.1 },
  targetProfitShare: { min: 0, max: 0.8 },
  ltvMultiple: { min: 1, max: 4 },
};

export function validateEconomics(e: UnitEconomics): string[] {
  const errs: string[] = [];
  const b = ECONOMICS_BOUNDS;
  if (!(e.aov >= b.aov.min && e.aov <= b.aov.max)) errs.push(`סל ממוצע חייב להיות בין ₪${b.aov.min} ל-₪${b.aov.max}`);
  if (!(e.grossMarginPct >= b.grossMarginPct.min && e.grossMarginPct <= b.grossMarginPct.max)) errs.push("מרווח גולמי חייב להיות בין 5% ל-95%");
  if (e.shippingPerOrder < 0) errs.push("עלות משלוח לא יכולה להיות שלילית");
  if (!(e.paymentFeePct >= b.paymentFeePct.min && e.paymentFeePct <= b.paymentFeePct.max)) errs.push("עמלת סליקה חייבת להיות בין 0% ל-10%");
  if (e.otherVariablePerOrder < 0) errs.push("עלויות משתנות אחרות לא יכולות להיות שליליות");
  if (!(e.targetProfitShare >= b.targetProfitShare.min && e.targetProfitShare <= b.targetProfitShare.max)) errs.push("נתח הרווח הרצוי חייב להיות בין 0% ל-80%");
  if (!(e.ltvMultiple >= b.ltvMultiple.min && e.ltvMultiple <= b.ltvMultiple.max)) errs.push("מכפיל LTV חייב להיות בין 1 ל-4");
  return errs;
}

// The whole derivation, in one place:
//
//   תרומה להזמנה = סל × מרווח גולמי − משלוח − סליקה − עלויות משתנות אחרות
//   ROAS איזון    = 1 ÷ (תרומה ÷ סל)          ← כאן הפרסום בדיוק אוכל את כל התרומה
//   ROAS יעד      = ROAS איזון ÷ ((1 − נתח הרווח) × מכפיל LTV)
//
// The LTV multiple lowers the required ROAS because a repeat customer keeps paying back the
// same acquisition cost — which is exactly why it must be measured, not assumed.
export function deriveEconomics(e: UnitEconomics): DerivedEconomics {
  const warnings: string[] = [];
  const contributionPerOrder =
    e.aov * e.grossMarginPct - e.shippingPerOrder - e.aov * e.paymentFeePct - e.otherVariablePerOrder;
  const contributionMarginPct = e.aov > 0 ? contributionPerOrder / e.aov : 0;

  if (contributionPerOrder <= 0) {
    return {
      contributionPerOrder: round2(contributionPerOrder),
      contributionMarginPct: round2(contributionMarginPct),
      breakEvenRoas: 0,
      breakEvenCac: 0,
      targetRoas: MIN_TARGET_ROAS,
      targetCac: 0,
      floorApplied: true,
      viable: false,
      warnings: ["ההזמנה לא מייצרת תרומה חיובית לפני פרסום — אין תקציב מדיה שיהפוך את זה לרווחי. לתקן מחיר, מרווח או עלות משלוח."],
    };
  }

  const breakEvenRoas = 1 / contributionMarginPct;
  const breakEvenCac = contributionPerOrder;
  const spendShare = (1 - e.targetProfitShare) * e.ltvMultiple;
  const rawTarget = breakEvenRoas / spendShare;
  const floorApplied = rawTarget < MIN_TARGET_ROAS;
  const targetRoas = floorApplied ? MIN_TARGET_ROAS : rawTarget;
  const targetCac = e.aov / targetRoas;

  if (floorApplied) {
    warnings.push(
      `היעד שנגזר (${round2(rawTarget)}) נמוך מרצפת ה-${MIN_TARGET_ROAS} — הפריסה תיבנה מול ${MIN_TARGET_ROAS}.`,
    );
  }
  if (e.ltvMultiple > 1) {
    warnings.push(`מכפיל LTV של ${e.ltvMultiple} מוריד את היעד — לוודא שהוא נמדד מרכישות חוזרות בפועל ולא הערכה.`);
  }
  if (contributionMarginPct < 0.2) {
    warnings.push(`תרומה של ${Math.round(contributionMarginPct * 100)}% בלבד — היעד יוצא גבוה וקשה להשגה. שווה לבחון מחיר או מבנה עלויות לפני הגדלת תקציב.`);
  }

  return {
    contributionPerOrder: round2(contributionPerOrder),
    contributionMarginPct: round2(contributionMarginPct),
    breakEvenRoas: round2(breakEvenRoas),
    breakEvenCac: round2(breakEvenCac),
    targetRoas: round2(targetRoas),
    targetCac: round2(targetCac),
    floorApplied,
    viable: true,
    warnings,
  };
}

// A worked example, for the playbook and for anyone reading the form for the first time.
export const ECONOMICS_EXAMPLE: UnitEconomics = {
  aov: 250,
  grossMarginPct: 0.6,
  shippingPerOrder: 25,
  paymentFeePct: 0.025,
  otherVariablePerOrder: 8,
  targetProfitShare: 0.25,
  ltvMultiple: 1,
};
