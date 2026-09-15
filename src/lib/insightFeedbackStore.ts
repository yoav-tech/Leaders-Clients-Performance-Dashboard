// What the managers taught the recommendation engine.
//
// One row per (brand, rule). Approving records that the generated wording is right for this client;
// correcting replaces it — the manager's own wording is stored as a template (see insightTemplate)
// and used from then on, re-rendered against each new period's figures.
//
// Keyed by brand because the same finding is phrased differently for different clients, and because
// a correction is a judgement about one account, not a global rewrite of the engine.
import { getSupabase, hasDb } from "./db";

export type FeedbackStatus = "approved" | "corrected";

export interface InsightFeedback {
  insightId: string;
  status: FeedbackStatus;
  /** The manager's wording with figures placeholdered. Null for a plain approval. */
  template: string | null;
  /** Exactly what they typed, kept for audit — the template is derived and lossy. */
  correctedRaw: string | null;
  /** The generated line they were reacting to. */
  original: string | null;
  /** Figures in the correction that couldn't be bound to the rule's data, so they won't update. */
  unresolved: string[];
  updatedBy: string | null;
  updatedAt: string | null;
}

export async function getInsightFeedback(brandId: string): Promise<Record<string, InsightFeedback>> {
  if (!hasDb()) return {};
  const { data, error } = await getSupabase()
    .from("insight_feedback")
    .select("insight_id,status,template,corrected_raw,original,unresolved,updated_by,updated_at")
    .eq("brand_id", brandId);
  if (error) return {}; // never let a missing feedback table block a draft
  const out: Record<string, InsightFeedback> = {};
  for (const r of data ?? []) {
    out[String(r.insight_id)] = {
      insightId: String(r.insight_id),
      status: (r.status as FeedbackStatus) ?? "approved",
      template: (r.template as string) ?? null,
      correctedRaw: (r.corrected_raw as string) ?? null,
      original: (r.original as string) ?? null,
      unresolved: (r.unresolved as string[]) ?? [],
      updatedBy: (r.updated_by as string) ?? null,
      updatedAt: (r.updated_at as string) ?? null,
    };
  }
  return out;
}

export async function saveInsightFeedback(
  brandId: string,
  fb: Omit<InsightFeedback, "updatedAt">,
): Promise<void> {
  if (!hasDb()) throw new Error("no database configured");
  const { error } = await getSupabase().from("insight_feedback").upsert({
    brand_id: brandId,
    insight_id: fb.insightId,
    status: fb.status,
    template: fb.template,
    corrected_raw: fb.correctedRaw,
    original: fb.original,
    unresolved: fb.unresolved,
    updated_by: fb.updatedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "brand_id,insight_id" });
  if (error) throw new Error(error.message);
}

/** Drop what was learned for one rule, so the engine's own wording comes back. */
export async function clearInsightFeedback(brandId: string, insightId: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase().from("insight_feedback").delete().match({ brand_id: brandId, insight_id: insightId });
  if (error) throw new Error(error.message);
}
