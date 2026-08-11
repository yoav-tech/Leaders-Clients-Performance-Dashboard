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
import {
  GUARDRAILS,
  PROFILES,
  SCALE_LADDER,
  SEASONALITY,
  STAGE_PATTERNS,
  classifyStage,
  defaultStageFor,
  performanceIndex,
  profileStages,
  runnableChannels,
  scaleStepFor,
  type FunnelStage,
} from "../src/lib/mediaPlanRules";
import { BUDGET_TIERS, MIN_BUDGET_RULE, PLATFORMS, isIngested, minLineBudget } from "../src/lib/platformRules";

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

  // The rules file is meant to be edited by the media team, so its own consistency is checked
  // before anything is built with it.
  console.log("— planning rules —");
  for (const [profile, r] of Object.entries(PROFILES)) {
    const stages = r.stages;
    ok(stages.length > 0, `${profile}: has stages`);
    ok(new Set(stages.map((s) => s.stage)).size === stages.length, `${profile}: no duplicate stages`);
    const defaults = stages.reduce((s, x) => s + x.defaultShare, 0);
    ok(Math.abs(defaults - 1) < 0.001, `${profile}: defaultShare must sum to 1 (got ${defaults.toFixed(3)})`);
    const floors = stages.reduce((s, x) => s + x.minShare, 0);
    ok(floors <= 1, `${profile}: minShare floors must not exceed 100% (got ${(floors * 100).toFixed(0)}%)`);
    const caps = stages.reduce((s, x) => s + x.maxShare, 0);
    ok(caps >= 1, `${profile}: maxShare caps must allow a full plan (got ${(caps * 100).toFixed(0)}%)`);
    for (const s of stages) {
      ok(s.minShare <= s.defaultShare && s.defaultShare <= s.maxShare, `${profile}/${s.stage}: min ≤ default ≤ max`);
      ok(s.minShare >= 0 && s.maxShare <= 1, `${profile}/${s.stage}: shares within 0..1`);
      ok(s.role.trim().length > 0, `${profile}/${s.stage}: has a documented role`);
      ok(s.channels.length > 0, `${profile}/${s.stage}: names at least one channel that can run it`);
    }
    // An explicit channel default must be a stage that channel is actually allowed to run, or
    // every unclassified campaign on it lands somewhere the rules say it can't go.
    for (const [ch, stage] of Object.entries(r.channelDefaults)) {
      const rule = stages.find((s) => s.stage === stage);
      ok(!!rule, `${profile}/${ch}: default stage "${stage}" is one of the profile's stages`);
      ok(!rule || rule.channels.includes(ch as never), `${profile}/${ch}: default stage "${stage}" is not runnable on ${ch}`);
    }
    ok(
      (["meta", "google", "tiktok"] as const).some((ch) => defaultStageFor(profile as keyof typeof PROFILES, ch) !== null),
      `${profile}: at least one channel can run this client type`,
    );
  }

  // Platform rules: the operational layer the allocation leans on.
  console.log("— platform rules —");
  for (const [id, p] of Object.entries(PLATFORMS)) {
    ok(p.id === id, `${id}: id matches its key`);
    ok(p.label.trim().length > 0, `${id}: has a label`);
    ok(p.noDataFloor > 0 && p.viewKpiFloor > 0, `${id}: has both fallback floors`);
    ok(p.healthyLineBudget >= p.viewKpiFloor, `${id}: healthy budget is not below the view-KPI floor`);
    ok(p.benchmarks.length > 0, `${id}: has benchmarks to read results against`);
    ok(p.benchmarks.every((b) => b.label && b.good), `${id}: every benchmark names a metric and a range`);
    ok(p.scaling.maxStepPct > 0 && p.scaling.maxStepPct <= 50, `${id}: scaling step is sane`);
    ok(p.cautions.length > 0, `${id}: documents what goes wrong on it`);
    ok(p.ingested === isIngested(p.id), `${id}: ingested flag matches INGESTED_PLATFORMS`);
    ok(!p.ingested || Boolean(p.connector), `${id}: an ingested platform names its Windsor connector`);
  }
  ok(Math.abs(BUDGET_TIERS.reduce((s, t) => s + t.share, 0) - 1) < 0.001, "budget tiers sum to 100%");

  // A stage may name a platform we do not ingest (LinkedIn, Reddit) — the doctrine records where
  // it belongs. But every profile must still have somewhere to actually plan.
  for (const [profile, r] of Object.entries(PROFILES)) {
    for (const s of r.stages) {
      ok(s.channels.every((c) => c in PLATFORMS), `${profile}/${s.stage}: names only known platforms`);
    }
    const plannable = r.stages.filter((s) => runnableChannels(profile as keyof typeof PROFILES, s.stage).length > 0);
    ok(plannable.length > 0, `${profile}: at least one stage runs on a platform we ingest`);
  }

  // Seasonality moves the recommendation, so a typo here quietly re-plans every client.
  for (const [m, s] of Object.entries(SEASONALITY)) {
    ok(s.factor >= 0.7 && s.factor <= 1.5, `seasonality ${m}: factor ${s.factor} outside a sane 0.7–1.5 band`);
    ok(s.note.trim().length > 0, `seasonality ${m}: says what drives it`);
  }

  // Every pattern must resolve to a stage the profiles it applies to actually plan against —
  // otherwise a campaign matches a rule and then silently falls back to the default.
  for (const p of STAGE_PATTERNS) {
    const profiles = p.profiles ?? (Object.keys(PROFILES) as (keyof typeof PROFILES)[]);
    const reachable = profiles.some((pr) => profileStages(pr).includes(p.stage));
    ok(reachable, `pattern ${p.pattern} → "${p.stage}" is unreachable for every profile it targets`);
  }

  // The ladder is read top-down, so it has to be sorted, and it must cover any index.
  for (let i = 1; i < SCALE_LADDER.length; i++) {
    ok(SCALE_LADDER[i].minIndex < SCALE_LADDER[i - 1].minIndex, `scale ladder must be sorted descending (step ${i})`);
  }
  ok(SCALE_LADDER[SCALE_LADDER.length - 1].minIndex === 0, "scale ladder must have a catch-all step at 0");
  ok(scaleStepFor(null).factor === 1, "no KPI target → no scaling");
  ok(scaleStepFor(5).factor <= GUARDRAILS.maxScaleUp, "scale up is capped by the guardrail");
  ok(scaleStepFor(0.01).factor >= GUARDRAILS.maxScaleDown, "scale down is floored by the guardrail");
  ok(Object.keys(SEASONALITY).length === 12, "seasonality covers all 12 months");

  // ROAS is higher-is-better, cost KPIs are lower-is-better — both must normalise to >1 = ahead.
  ok((performanceIndex("roas", 4, 2) ?? 0) === 2, "ROAS above target → index > 1");
  ok((performanceIndex("cpl", 50, 100) ?? 0) === 2, "CPL below target → index > 1");
  ok(performanceIndex("roas", 4, null) === null, "no target → no index");

  // Spot-check the classifier against names in the shape the accounts actually use.
  const cases: [Parameters<typeof classifyStage>[0], Parameters<typeof classifyStage>[1], string, FunnelStage][] = [
    ["ecommerce", "meta", "ARG | Retargeting | Broad", "retargeting"],
    ["ecommerce", "meta", "ARG | Prospecting | Lookalike", "prospecting"],
    ["ecommerce", "meta", "ARG | קטלוג | DPA", "shopping"],
    ["ecommerce", "google", "Brand — Exact", "brand_search"],
    ["ecommerce", "google", "PMax — All products", "shopping"],
    ["ecommerce", "google", "Generic — Hair care", "generic_search"],
    ["ecommerce", "meta", "משהו בלי שום סימן", "prospecting"],
    ["views", "tiktok", "Style | UGC | Aug", "ugc"],
    ["views", "meta", "Style | משפיעניות", "influencers"],
    ["views", "meta", "Style | Reach", "awareness"],
    ["app", "meta", "Haat | HR | טופס", "leads"],
    ["app", "meta", "Haat | App installs", "installs"],
  ];
  for (const [profile, channel, name, expected] of cases) {
    const got = classifyStage(profile, channel, name);
    ok(got === expected, `classify "${name}" (${profile}/${channel}) → expected ${expected}, got ${got}`);
  }

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

    // Guardrails the plan must never violate.
    ok(p.lines.every((l) => l.budget % GUARDRAILS.roundTo === 0), `${b.id}: every line rounds to ₪${GUARDRAILS.roundTo}`);
    ok(p.lines.every((l) => profileStages(p.profile).includes(l.stage)), `${b.id}: every line's stage belongs to the profile`);
    ok(p.scale.factor <= GUARDRAILS.maxScaleUp && p.scale.factor >= GUARDRAILS.maxScaleDown * 1.0, `${b.id}: scale factor inside the guardrails`);

    // Stage bands: what actually landed on each stage must sit inside its rule, allowing for
    // rounding and for stages that lost a line to the minimum-budget rule.
    if (p.totalBudget > 0 && p.lines.length > 1) {
      for (const stage of new Set(p.lines.map((l) => l.stage))) {
        const share = p.lines.filter((l) => l.stage === stage).reduce((s, l) => s + l.budget, 0) / p.totalBudget;
        const rule = PROFILES[p.profile].stages.find((s) => s.stage === stage)!;
        ok(share <= rule.maxShare + 0.05, `${b.id}/${stage}: ${(share * 100).toFixed(0)}% exceeds the ${(rule.maxShare * 100).toFixed(0)}% cap`);
      }
    }

    // Every profile must render both email bodies without throwing.
    ok(renderPlanHtml(p).startsWith("<!doctype html>"), `${b.id}: html renders`);
    ok(renderPlanText(p).length > 0, `${b.id}: text renders`);
    ok(planSubject(p).includes(b.name), `${b.id}: subject names the brand`);

    console.log(
      `  ${b.id.padEnd(14)} ${String(p.profile).padEnd(10)} ${p.budgetSource.padEnd(8)} ₪${p.totalBudget.toLocaleString("en-US").padStart(9)}  ${p.lines.length} lines`,
    );
  }

  // The minimum-line rule: 50 conversions at the cell's own cost per conversion, with the two
  // documented fallbacks.
  console.log("— minimum line budget —");
  ok(minLineBudget("meta", 120, true) === 6000, "₪120 CPA → ₪6,000 floor (50 × 120)");
  ok(minLineBudget("meta", 400, true) === 20000, "₪400 CPA → ₪20,000 floor");
  ok(minLineBudget("meta", null, true) === 15000, "no cost-per-conversion → the ₪15k no-data floor");
  ok(minLineBudget("meta", 0, true) === 15000, "a zero cost per conversion is treated as no data");
  ok(minLineBudget("linkedin", null, true) === 15000, "no-data floor is the same across platforms");
  ok(
    minLineBudget("meta", null, true) * 2 === MIN_BUDGET_RULE.twoPlatformMinimum,
    `two no-data platforms must cost ₪${MIN_BUDGET_RULE.twoPlatformMinimum}`,
  );
  ok(minLineBudget("meta", 0.03, false) === PLATFORMS.meta.viewKpiFloor, "a view KPI uses the operational floor, not 50 × CPV");
  ok(MIN_BUDGET_RULE.conversions === 50, "the rule is 50 conversions");

  console.log("— manager budget override —");
  const argania = BRANDS.find((b) => b.id === "argania")!;
  const override = await buildMediaPlan(argania, MONTH, { budgetOverride: 73_333 });
  ok(override.totalBudget === 73_350, `override rounds to the nearest ₪50 (got ${override.totalBudget})`);
  ok(override.lines.reduce((s, l) => s + l.budget, 0) === override.totalBudget, "override: lines still sum to the total");

  console.log(fails === 0 ? "\nALL OK" : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}

main();
