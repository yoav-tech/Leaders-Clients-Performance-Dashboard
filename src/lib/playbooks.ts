// Per-brand playbooks: the account knowledge that generic marketing rules can't supply.
//
// The recommendation engine computes arithmetic — unit costs, gaps, pacing. What it cannot know is
// what a number means on a particular account: which floor actually matters, what a healthy
// audience mix looks like, and when an efficient channel is a real opportunity rather than the
// echo of something that already happened. That judgement lives here, captured from the people
// who run the accounts, and is quoted verbatim in the recommendations.

export interface Playbook {
  brandId: string;
  /** The metric the account is genuinely judged on at month end. */
  primaryKpi: string;
  /** Hard floor on paid ROAS — breaching it is the most urgent thing on the account. */
  paidRoasFloor?: number;
  /** Target share of store revenue that should come from new customers (0-1). */
  newCustomerShareTarget?: number;
  /** Ceiling on a single day's budget change per platform, as a fraction. Above it, campaigns
   *  re-enter learning and the change costs more than it buys. */
  maxDailyBudgetChange: number;
  /** Questions that must be answered before acting on an efficient-but-small channel. Printed with
   *  the recommendation so nobody scales on the number alone. */
  scaleChecks: string[];
  /** Levers we actually control, in the order we'd reach for them. */
  levers: string[];
  /** Things never to recommend on this account. */
  neverRecommend: string[];
}

export const PLAYBOOKS: Record<string, Playbook> = {
  argania: {
    brandId: "argania",
    primaryKpi:
      "Store revenue, with paid ROAS held above the floor and a healthy new-vs-returning mix. " +
      "Site ROAS flatters the account because it counts revenue paid media didn't create — it is " +
      "context, not the target.",
    paidRoasFloor: 2.4,
    newCustomerShareTarget: 0.7,
    maxDailyBudgetChange: 0.2,
    scaleChecks: [
      "האם משפיענית עלתה באורגני עם לינק? אם היא כבר עלתה — המומנטום חלף ואין מה לרדוף אחריו.",
      "אם היעילות נובעת מהשיווק הכללי ולא מאירוע חד-פעמי — אז כן, להעלות תקציב.",
      "האם מתוכננת עלייה מרוכזת של משפיעניות או דיוור? אם כן, להיערך ולהעלות תקציב לפני ולא אחרי.",
      "בגוגל: מונחי מותג או גנרי? ואם Performance Max — אילו קריאייטיבים ויזואליים ועל איזה קהל?",
    ],
    levers: [
      "Reallocate between platforms, ramped within the daily change limit",
      "Pause or scale individual creatives",
      "Shift between brand and generic search terms",
      "Time budget to planned influencer pushes and email sends",
    ],
    neverRecommend: [
      "Raising a platform's budget by more than the daily change limit in one step",
      "Scaling an efficient channel before diagnosing what made it efficient",
      "Judging the account on site ROAS alone",
    ],
  },
};

export const playbookFor = (brandId: string): Playbook | null => PLAYBOOKS[brandId] ?? null;

/** Express a budget move as a compliant daily ramp instead of a lump sum. */
export function rampDays(currentDaily: number, targetDaily: number, maxChange: number): number {
  if (currentDaily <= 0 || targetDaily <= currentDaily) return 0;
  return Math.ceil(Math.log(targetDaily / currentDaily) / Math.log(1 + maxChange));
}
