// Brand-level targets a media manager can set from the dashboard.
//
// Every goal the reports colour against — ROAS, cost per view, cost per lead, cost per registration,
// the monthly budget — lived only in brands.ts. Changing one meant a commit and a deploy, which is
// the wrong shape for numbers the media manager agrees with the client and revises. It also caused
// real damage: Protein Max and Style ran for weeks marked red against a cost-per-view figure
// derived from a benchmark that nobody had agreed to, because correcting it required a code change.
//
// The config stays the default. A row here overrides it, and a NULL column falls back, so the
// configured figure remains visible and an override is always deliberate.
import { getSupabase, hasDb } from "./db";
import type { BrandConfig } from "./brands";
import { reportGroupOf } from "./brands";

export interface BrandTargets {
  monthlyBudget: number | null;
  targetRoas: number | null;
  targetCpv: number | null;
  targetCpl: number | null;
  targetCpReg: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export const EMPTY_TARGETS: BrandTargets = {
  monthlyBudget: null, targetRoas: null, targetCpv: null, targetCpl: null, targetCpReg: null,
  updatedBy: null, updatedAt: null,
};

export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Which goals mean anything for this brand — a ROAS target on an awareness client is noise. */
export type TargetField = "monthlyBudget" | "targetRoas" | "targetCpv" | "targetCpl" | "targetCpReg";
export function targetFieldsFor(b: BrandConfig): TargetField[] {
  const g = reportGroupOf(b);
  if (g === "ecommerce") return ["monthlyBudget", "targetRoas"];
  if (g === "views") return ["monthlyBudget", "targetCpv"];
  if (g === "leads") return b.appInstall ? ["monthlyBudget", "targetCpReg"] : ["monthlyBudget", "targetCpl"];
  return ["monthlyBudget"]; // impression share — the goal is presence, set per account in the plan
}

export const TARGET_LABEL: Record<TargetField, string> = {
  monthlyBudget: "תקציב חודשי",
  targetRoas: "יעד רואס",
  targetCpv: "יעד עלות לצפייה",
  targetCpl: "יעד עלות לליד",
  targetCpReg: "יעד עלות להרשמה",
};

export async function getBrandTargets(brandId: string): Promise<BrandTargets> {
  if (!hasDb()) return EMPTY_TARGETS;
  const { data, error } = await getSupabase()
    .from("brand_targets")
    .select("monthly_budget,target_roas,target_cpv,target_cpl,target_cp_reg,updated_by,updated_at")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error || !data) return EMPTY_TARGETS;
  return {
    monthlyBudget: num(data.monthly_budget), targetRoas: num(data.target_roas),
    targetCpv: num(data.target_cpv), targetCpl: num(data.target_cpl), targetCpReg: num(data.target_cp_reg),
    updatedBy: (data.updated_by as string) ?? null, updatedAt: (data.updated_at as string) ?? null,
  };
}

export async function saveBrandTargets(brandId: string, t: Omit<BrandTargets, "updatedBy" | "updatedAt">, by: string | null): Promise<void> {
  if (!hasDb()) throw new Error("no database configured");
  const allNull = Object.values(t).every((v) => v == null);
  const sb = getSupabase();
  if (allNull) { await sb.from("brand_targets").delete().eq("brand_id", brandId); return; }
  const { error } = await sb.from("brand_targets").upsert({
    brand_id: brandId,
    monthly_budget: t.monthlyBudget, target_roas: t.targetRoas, target_cpv: t.targetCpv,
    target_cpl: t.targetCpl, target_cp_reg: t.targetCpReg,
    updated_by: by, updated_at: new Date().toISOString(),
  }, { onConflict: "brand_id" });
  if (error) throw new Error(error.message);
}

/** The brand as the reports should read it: config, with any dashboard override on top. */
export function applyBrandTargets(b: BrandConfig, t: BrandTargets): BrandConfig {
  return {
    ...b,
    monthlyBudget: t.monthlyBudget ?? b.monthlyBudget,
    targetRoas: t.targetRoas ?? b.targetRoas,
    targetCpv: t.targetCpv ?? b.targetCpv,
    targetCpl: t.targetCpl ?? b.targetCpl,
    targetCpReg: t.targetCpReg ?? b.targetCpReg,
  };
}

/**
 * The brand every report should be built from. Resolved once per request and passed down, because
 * BrandConfig is consumed synchronously in dozens of places and making all of them async to read one
 * row would be a far larger change than the feature is worth.
 */
export async function resolveBrand(b: BrandConfig): Promise<BrandConfig> {
  const t = await getBrandTargets(b.id).catch(() => EMPTY_TARGETS);
  return applyBrandTargets(b, t);
}
