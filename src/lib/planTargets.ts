// Media-plan targets a media manager can set from the dashboard.
//
// The plan lines live in brands.ts, which means every revision — TikTok stopped at ₪206,093.93,
// YouTube's line raised from ₪20k to ₪63,906 — was a code change and a deploy. That is the wrong
// shape for a number the media manager owns and revises mid-flight, and it left YouTube running on
// Chery with no view target at all because nobody was going to open a pull request to add one.
//
// So the config is the default and these rows are the override. A field left empty falls back to
// the plan as signed, which keeps the signed figures visible rather than replacing them silently.
import { getSupabase, hasDb } from "./db";

export interface PlanTargetRow {
  platform: string;
  budget: number | null;
  thruplay: number | null;
  completedViews: number | null;
}
export interface LeadTargetRow { leads: number | null; cpa: number | null }

export interface PlanTargets {
  lines: Record<string, PlanTargetRow>;
  leads: LeadTargetRow | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function getPlanTargets(brandId: string): Promise<PlanTargets> {
  const empty: PlanTargets = { lines: {}, leads: null, updatedBy: null, updatedAt: null };
  if (!hasDb()) return empty;
  const sb = getSupabase();
  const [lines, leads] = await Promise.all([
    sb.from("platform_plan_targets").select("platform,budget,thruplay,completed_views,updated_by,updated_at").eq("brand_id", brandId),
    sb.from("platform_plan_lead_targets").select("leads,cpa,updated_by,updated_at").eq("brand_id", brandId).maybeSingle(),
  ]);
  if (lines.error) return empty;

  const out: PlanTargets = { ...empty, lines: {} };
  for (const r of lines.data ?? []) {
    out.lines[String(r.platform)] = {
      platform: String(r.platform),
      budget: num(r.budget), thruplay: num(r.thruplay), completedViews: num(r.completed_views),
    };
    const at = r.updated_at as string | null;
    if (at && (!out.updatedAt || at > out.updatedAt)) { out.updatedAt = at; out.updatedBy = (r.updated_by as string) ?? null; }
  }
  if (leads.data) {
    out.leads = { leads: num(leads.data.leads), cpa: num(leads.data.cpa) };
    const at = leads.data.updated_at as string | null;
    if (at && (!out.updatedAt || at > out.updatedAt)) { out.updatedAt = at; out.updatedBy = (leads.data.updated_by as string) ?? null; }
  }
  return out;
}

export async function savePlanTargets(
  brandId: string,
  lines: PlanTargetRow[],
  leads: LeadTargetRow | null,
  by: string | null,
): Promise<void> {
  if (!hasDb()) throw new Error("no database configured");
  const sb = getSupabase();
  const now = new Date().toISOString();

  // A row whose every field is empty is a request to go back to the signed plan, so it's deleted
  // rather than stored as a row of nulls that reads like an override to nothing.
  const keep = lines.filter((l) => l.budget != null || l.thruplay != null || l.completedViews != null);
  const drop = lines.filter((l) => !keep.includes(l)).map((l) => l.platform);

  if (keep.length) {
    const { error } = await sb.from("platform_plan_targets").upsert(
      keep.map((l) => ({
        brand_id: brandId, platform: l.platform,
        budget: l.budget, thruplay: l.thruplay, completed_views: l.completedViews,
        updated_by: by, updated_at: now,
      })),
      { onConflict: "brand_id,platform" },
    );
    if (error) throw new Error(error.message);
  }
  if (drop.length) {
    await sb.from("platform_plan_targets").delete().eq("brand_id", brandId).in("platform", drop);
  }

  if (leads && (leads.leads != null || leads.cpa != null)) {
    const { error } = await sb.from("platform_plan_lead_targets").upsert(
      { brand_id: brandId, leads: leads.leads, cpa: leads.cpa, updated_by: by, updated_at: now },
      { onConflict: "brand_id" },
    );
    if (error) throw new Error(error.message);
  } else {
    await sb.from("platform_plan_lead_targets").delete().eq("brand_id", brandId);
  }
}
