// Persistence for the monthly media plans (media_plans). A plan is built as a draft, reviewed
// by a media manager, approved, and only then emailed — so the status transitions are the
// contract this module protects: a rebuild never silently overwrites an approved or sent plan.
import { getSupabase, hasDb } from "./db";
import type { CampaignProfile } from "./brands";
import type { MediaPlanDraft, PlanBasis, PlanLine, ScaleDecision } from "./mediaPlanBuilder";

export type PlanStatus = "draft" | "approved" | "sent";

export interface StoredPlan extends MediaPlanDraft {
  status: PlanStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  sentTo: string[];
  sentAt: string | null;
  updatedAt: string | null;
}

const SELECT =
  "brand_id,month,status,profile,budget_source,total_budget,baseline_budget,recommended_budget,lines,rationale,basis,approved_by,approved_at,sent_to,sent_at,updated_at";

type Row = Record<string, unknown>;

function toPlan(r: Row): StoredPlan {
  const lines = (r.lines as PlanLine[] | null) ?? [];
  const basis = (r.basis as (PlanBasis & { scale?: ScaleDecision; brandName?: string; brandNameHe?: string; monthStart?: string; monthEnd?: string }) | null) ?? null;
  const month = String(r.month);
  return {
    brandId: String(r.brand_id),
    brandName: basis?.brandName ?? String(r.brand_id),
    brandNameHe: basis?.brandNameHe ?? "",
    month,
    monthStart: basis?.monthStart ?? `${month}-01`,
    monthEnd: basis?.monthEnd ?? `${month}-28`,
    profile: String(r.profile) as CampaignProfile,
    budgetSource: r.budget_source === "proposed" ? "proposed" : "fixed",
    totalBudget: Number(r.total_budget),
    baselineBudget: Number(r.baseline_budget),
    recommendedBudget: Number(r.recommended_budget),
    scale: basis?.scale ?? { factor: 1, scaleFactor: 1, seasonalFactor: 1, kpi: "roas", kpiValue: null, kpiTarget: null, index: null, reason: "" },
    lines,
    rationale: (r.rationale as string[] | null) ?? [],
    basis: {
      from: basis?.from ?? "",
      to: basis?.to ?? "",
      lookbackDays: basis?.lookbackDays ?? 0,
      stageSource: basis?.stageSource ?? "channel-only",
      rulesVersion: basis?.rulesVersion ?? "",
      channels: basis?.channels ?? [],
    },
    status: (String(r.status) as PlanStatus) ?? "draft",
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    sentTo: (r.sent_to as string[] | null) ?? [],
    sentAt: (r.sent_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  };
}

// The whole draft is stored: the columns carry what we query on, `basis` carries the rest so a
// stored plan renders identically to a freshly built one.
function toRow(d: MediaPlanDraft, status: PlanStatus): Row {
  return {
    brand_id: d.brandId,
    month: d.month,
    status,
    profile: d.profile,
    budget_source: d.budgetSource,
    total_budget: d.totalBudget,
    baseline_budget: d.baselineBudget,
    recommended_budget: d.recommendedBudget,
    lines: d.lines,
    rationale: d.rationale,
    basis: { ...d.basis, scale: d.scale, brandName: d.brandName, brandNameHe: d.brandNameHe, monthStart: d.monthStart, monthEnd: d.monthEnd },
    updated_at: new Date().toISOString(),
  };
}

export async function getPlan(brandId: string, month: string): Promise<StoredPlan | null> {
  if (!hasDb()) return null;
  const { data, error } = await getSupabase().from("media_plans").select(SELECT).eq("brand_id", brandId).eq("month", month).maybeSingle();
  if (error) throw new Error(`media_plans read failed: ${error.message}`);
  return data ? toPlan(data as Row) : null;
}

export async function listPlans(month: string): Promise<StoredPlan[]> {
  if (!hasDb()) return [];
  const { data, error } = await getSupabase().from("media_plans").select(SELECT).eq("month", month).limit(200);
  if (error) throw new Error(`media_plans list failed: ${error.message}`);
  return (data ?? []).map((r) => toPlan(r as Row));
}

// Store a freshly built plan as a draft. An approved or sent plan is left untouched unless
// `force` is set, so the monthly cron can re-run safely.
export async function saveDraft(draft: MediaPlanDraft, force = false): Promise<{ saved: boolean; reason?: string }> {
  if (!hasDb()) return { saved: false, reason: "no-db" };
  const existing = await getPlan(draft.brandId, draft.month);
  if (existing && existing.status !== "draft" && !force) return { saved: false, reason: existing.status };

  const row = toRow(draft, "draft");
  if (existing) {
    // Rebuilding clears any prior approval — the numbers changed, so the sign-off no longer applies.
    const { error } = await getSupabase()
      .from("media_plans")
      .update({ ...row, approved_by: null, approved_at: null })
      .eq("brand_id", draft.brandId)
      .eq("month", draft.month);
    if (error) throw new Error(`media_plans update failed: ${error.message}`);
  } else {
    const { error } = await getSupabase().from("media_plans").insert(row);
    if (error) throw new Error(`media_plans insert failed: ${error.message}`);
  }
  return { saved: true };
}

export async function approvePlan(brandId: string, month: string, approvedBy: string): Promise<StoredPlan | null> {
  if (!hasDb()) return null;
  const { error } = await getSupabase()
    .from("media_plans")
    .update({ status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("month", month)
    .eq("status", "draft"); // only a draft can be approved
  if (error) throw new Error(`media_plans approve failed: ${error.message}`);
  return getPlan(brandId, month);
}

export async function markSent(brandId: string, month: string, to: string[]): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase()
    .from("media_plans")
    .update({ status: "sent", sent_to: to, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("month", month);
  if (error) throw new Error(`media_plans send-mark failed: ${error.message}`);
}
