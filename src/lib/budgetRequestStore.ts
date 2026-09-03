// Per-city budget change requests: the client states the daily/monthly budget they want for a
// city, and saving notifies the media managers by email. One row per brand+city holds the current
// ask — the emails are the history.
import { getSupabase, hasDb } from "./db";

export interface BudgetRequest {
  city: string;
  daily: number | null;
  monthly: number | null;
  note: string;
  requestedBy: string | null;
  updatedAt: string | null;
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function listBudgetRequests(brandId: string): Promise<Record<string, BudgetRequest>> {
  if (!hasDb()) return {};
  const { data, error } = await getSupabase()
    .from("budget_requests")
    .select("city,daily_budget,monthly_budget,note,requested_by,updated_at")
    .eq("brand_id", brandId);
  if (error) throw new Error(`budget requests lookup failed: ${error.message}`);
  const out: Record<string, BudgetRequest> = {};
  for (const r of data ?? []) {
    const city = String(r.city ?? "");
    if (!city) continue;
    out[city] = {
      city,
      daily: toNum(r.daily_budget),
      monthly: toNum(r.monthly_budget),
      note: String(r.note ?? ""),
      requestedBy: (r.requested_by as string) ?? null,
      updatedAt: (r.updated_at as string) ?? null,
    };
  }
  return out;
}

export interface BudgetRequestInput { city: string; daily: number | null; monthly: number | null }

export async function saveBudgetRequests(brandId: string, rows: BudgetRequestInput[], note: string, by: string): Promise<void> {
  if (!hasDb() || rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from("budget_requests")
    .upsert(
      rows.map((r) => ({
        brand_id: brandId,
        city: r.city,
        daily_budget: r.daily,
        monthly_budget: r.monthly,
        note: note.slice(0, 2000),
        requested_by: by,
        updated_at: now,
      })),
      { onConflict: "brand_id,city" },
    );
  if (error) throw new Error(error.message);
}
