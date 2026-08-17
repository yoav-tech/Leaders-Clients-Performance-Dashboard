// Persistence for the marketing command center's content calendar (Leaders / Bestie) + monthly
// sign-off. Managers create/edit items; the CEO (client) approves. Mirrors clientReportStore.ts.
import { getSupabase, hasDb } from "./db";

export type ContentStatus = "draft" | "pending" | "approved" | "changes_requested" | "scheduled" | "published";
export type ContentPlatform = "instagram" | "facebook" | "linkedin";
export type AssetKind = "image" | "video" | "link";
export type MonthStatus = "draft" | "pending" | "approved";

export interface ContentItem {
  id: string;
  brandId: string;
  date: string; // YYYY-MM-DD (scheduled_date)
  platform: ContentPlatform;
  title: string;
  body: string;
  assetPath: string | null;
  assetKind: AssetKind;
  briefId: string | null;
  status: ContentStatus;
  clientFeedback: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface MonthApproval { status: MonthStatus; note: string; approvedBy: string | null; approvedAt: string | null }

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const sn = (v: unknown) => (v == null ? null : String(v));

function toItem(r: Row): ContentItem {
  return {
    id: s(r.id),
    brandId: s(r.brand_id),
    date: s(r.scheduled_date).slice(0, 10),
    platform: (s(r.platform) || "instagram") as ContentPlatform,
    title: s(r.title),
    body: s(r.body),
    assetPath: sn(r.asset_path),
    assetKind: (s(r.asset_kind) || "link") as AssetKind,
    briefId: sn(r.brief_id),
    status: (s(r.status) || "draft") as ContentStatus,
    clientFeedback: s(r.client_feedback),
    createdBy: sn(r.created_by),
    approvedBy: sn(r.approved_by),
    approvedAt: sn(r.approved_at),
  };
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { start: `${month}-01`, end: `${nextY}-${String(nextM).padStart(2, "0")}-01` };
}

export async function listItems(brandId: string, month: string): Promise<ContentItem[]> {
  if (!hasDb()) return [];
  const { start, end } = monthBounds(month);
  const { data, error } = await getSupabase()
    .from("content_items")
    .select("*")
    .eq("brand_id", brandId)
    .gte("scheduled_date", start)
    .lt("scheduled_date", end)
    .order("scheduled_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toItem);
}

export async function getItem(id: string): Promise<ContentItem | null> {
  if (!hasDb()) return null;
  const { data } = await getSupabase().from("content_items").select("*").eq("id", id).maybeSingle();
  return data ? toItem(data) : null;
}

// Create (no id) or update (id present). Managers only — role gating happens in the route.
export async function upsertItem(input: Partial<ContentItem> & { brandId: string; date: string; platform: ContentPlatform }): Promise<ContentItem> {
  if (!hasDb()) throw new Error("db not configured");
  const row = {
    brand_id: input.brandId,
    scheduled_date: input.date,
    platform: input.platform,
    title: input.title ?? "",
    body: input.body ?? "",
    asset_path: input.assetPath ?? null,
    asset_kind: input.assetKind ?? "link",
    brief_id: input.briefId ?? null,
    updated_at: new Date().toISOString(),
  };
  const db = getSupabase();
  if (input.id) {
    const { data, error } = await db.from("content_items").update(row).eq("id", input.id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return toItem(data as Row);
  }
  const { data, error } = await db
    .from("content_items")
    .insert({ ...row, status: input.status ?? "draft", created_by: input.createdBy ?? null })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toItem(data as Row);
}

export async function setItemStatus(id: string, status: ContentStatus, by: string, feedback?: string): Promise<void> {
  if (!hasDb()) return;
  const patch: Row = { status, updated_at: new Date().toISOString() };
  if (status === "approved") { patch.approved_by = by; patch.approved_at = new Date().toISOString(); }
  if (feedback !== undefined) patch.client_feedback = feedback;
  const { error } = await getSupabase().from("content_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteItem(id: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase().from("content_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const monthKey = (brandId: string, month: string) => ({ brand_id: brandId, month });

export async function getMonthApproval(brandId: string, month: string): Promise<MonthApproval> {
  if (!hasDb()) return { status: "draft", note: "", approvedBy: null, approvedAt: null };
  const { data } = await getSupabase()
    .from("content_month_approvals")
    .select("status,note,approved_by,approved_at")
    .match(monthKey(brandId, month))
    .maybeSingle();
  if (!data) return { status: "draft", note: "", approvedBy: null, approvedAt: null };
  return { status: (s(data.status) || "draft") as MonthStatus, note: s(data.note), approvedBy: sn(data.approved_by), approvedAt: sn(data.approved_at) };
}

export async function setMonthStatus(brandId: string, month: string, status: MonthStatus, by: string, note?: string): Promise<void> {
  if (!hasDb()) return;
  const row: Row = { ...monthKey(brandId, month), status, updated_at: new Date().toISOString() };
  if (note !== undefined) row.note = note;
  if (status === "approved") { row.approved_by = by; row.approved_at = new Date().toISOString(); }
  const { error } = await getSupabase().from("content_month_approvals").upsert(row, { onConflict: "brand_id,month" });
  if (error) throw new Error(error.message);
}
