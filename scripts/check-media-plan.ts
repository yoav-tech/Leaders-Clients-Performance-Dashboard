// Sanity check for the media-plan builder + email renderers: `npm run check:media-plan`.
//
// Runs without a database or a Windsor key — the builder must still produce a coherent plan for
// every brand (falling back to the configured monthly budget and an even channel split). The
// invariants asserted here are the ones a bad allocation would break first: line budgets adding
// up to the plan total, shares summing to 100%, and every profile rendering an email.
//
// With SUPABASE_* set in .env.local this also exercises the real 90-day lookback.
import { BRANDS } from "../src/lib/brands";
import { buildMediaPlan, monthBounds, nextMonthOf, prevMonthOf } from "../src/lib/mediaPlanBuilder";
import { monthLabel, planSubject, renderPlanHtml, renderPlanText } from "../src/lib/mediaPlanEmail";

const MONTH = process.argv[2] ?? "2026-09";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    fails++;
    console.error("  FAIL:", msg);
  }
};

async function main() {
  console.log("— month helpers —");
  ok(nextMonthOf("2026-12-24") === "2027-01", "December rolls into the next year");
  ok(nextMonthOf("2026-08-24") === "2026-09", "August → September");
  ok(prevMonthOf("2026-01") === "2025-12", "January rolls back a year");
  ok(monthBounds("2026-02").days === 28, "Feb 2026 has 28 days");
  ok(monthBounds("2024-02").days === 29, "Feb 2024 has 29 days (leap)");
  ok(monthBounds("2026-09").end === "2026-09-30", "September ends on the 30th");
  ok(monthLabel("2026-09") === "ספטמבר 2026", "Hebrew month label");

  console.log(`— plans for ${MONTH} —`);
  for (const b of BRANDS) {
    const p = await buildMediaPlan(b, MONTH);
    const sum = p.lines.reduce((s, l) => s + l.budget, 0);
    const shares = p.lines.reduce((s, l) => s + l.sharePct, 0);

    ok(sum === p.totalBudget, `${b.id}: line budgets (${sum}) must equal the plan total (${p.totalBudget})`);
    ok(p.lines.every((l) => l.budget >= 0), `${b.id}: no negative line budgets`);
    ok(p.totalBudget >= 0, `${b.id}: non-negative total`);
    ok(p.rationale.length > 0, `${b.id}: has a rationale`);
    ok(p.month === MONTH && p.monthEnd === monthBounds(MONTH).end, `${b.id}: month bounds`);
    ok(new Set(p.lines.map((l) => `${l.channel}:${l.stage}`)).size === p.lines.length, `${b.id}: no duplicate channel×stage lines`);
    if (b.monthlyBudget > 0) ok(p.totalBudget === b.monthlyBudget && p.budgetSource === "fixed", `${b.id}: configured budget honoured`);
    if (p.lines.length && p.totalBudget > 0) ok(Math.abs(shares - 100) < 1.5, `${b.id}: shares ≈ 100% (got ${shares})`);

    // Every profile must render both email bodies without throwing.
    ok(renderPlanHtml(p).startsWith("<!doctype html>"), `${b.id}: html renders`);
    ok(renderPlanText(p).length > 0, `${b.id}: text renders`);
    ok(planSubject(p).includes(b.name), `${b.id}: subject names the brand`);

    console.log(
      `  ${b.id.padEnd(14)} ${String(p.profile).padEnd(10)} ${p.budgetSource.padEnd(8)} ₪${p.totalBudget.toLocaleString("en-US").padStart(9)}  ${p.lines.length} lines`,
    );
  }

  console.log("— manager budget override —");
  const argania = BRANDS.find((b) => b.id === "argania")!;
  const override = await buildMediaPlan(argania, MONTH, { budgetOverride: 73_333 });
  ok(override.totalBudget === 73_350, `override rounds to the nearest ₪50 (got ${override.totalBudget})`);
  ok(override.lines.reduce((s, l) => s + l.budget, 0) === override.totalBudget, "override: lines still sum to the total");

  console.log(fails === 0 ? "\nALL OK" : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
