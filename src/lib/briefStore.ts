// Persistence for creative briefs (marketing command center). Managers write; the CEO reads.
import { getSupabase, hasDb } from "./db";

export type BriefStatus = "draft" | "active" | "done";
export interface Brief {
  id: string;
  brandId: string;
  title: string;
  objective: string;
  audience: string;
  keyMessage: string;
  channels: string[];
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: BriefStatus;
  notes: string;
  createdBy: string | null;
  createdAt: string | null;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const sn = (v: unknown) => (v == null ? null : String(v));

function toBrief(r: Row): Brief {
  return {
    id: s(r.id),
    brandId: s(r.brand_id),
    title: s(r.title),
    objective: s(r.objective),
    audience: s(r.audience),
    keyMessage: s(r.key_message),
    channels: Array.isArray(r.channels) ? (r.channels as string[]) : [],
    budget: r.budget == null ? null : Number(r.budget),
    startDate: r.start_date ? s(r.start_date).slice(0, 10) : null,
    endDate: r.end_date ? s(r.end_date).slice(0, 10) : null,
    status: (s(r.status) || "draft") as BriefStatus,
    notes: s(r.notes),
    createdBy: sn(r.created_by),
    createdAt: sn(r.created_at),
  };
}

export async function listBriefs(brandId: string): Promise<Brief[]> {
  if (!hasDb()) return [];
  const { data, error } = await getSupabase()
    .from("briefs")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBrief);
}

export async function upsertBrief(input: Partial<Brief> & { brandId: string }): Promise<Brief> {
  if (!hasDb()) throw new Error("db not configured");
  const row: Row = {
    brand_id: input.brandId,
    title: input.title ?? "",
    objective: input.objective ?? "",
    audience: input.audience ?? "",
    key_message: input.keyMessage ?? "",
    channels: input.channels ?? [],
    budget: input.budget ?? null,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    status: input.status ?? "draft",
    notes: input.notes ?? "",
    updated_at: new Date().toISOString(),
  };
  const db = getSupabase();
  if (input.id) {
    const { data, error } = await db.from("briefs").update(row).eq("id", input.id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return toBrief(data as Row);
  }
  const { data, error } = await db.from("briefs").insert({ ...row, created_by: input.createdBy ?? null }).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return toBrief(data as Row);
}

export async function deleteBrief(id: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase().from("briefs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
