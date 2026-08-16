// Persistence for the client report's manager note + send status (per brand + period + range).
// Only media managers write; clients read the note as part of their report.
import { getSupabase, hasDb } from "./db";

export type ReportPeriod = "week" | "month" | "custom";
export interface ReportNote { note: string; status: "draft" | "sent"; sentAt: string | null }

const key = (brandId: string, period: ReportPeriod, from: string, to: string) => ({ brand_id: brandId, period, from_date: from, to_date: to });

export async function getReportNote(brandId: string, period: ReportPeriod, from: string, to: string): Promise<ReportNote> {
  if (!hasDb()) return { note: "", status: "draft", sentAt: null };
  const { data } = await getSupabase()
    .from("client_report_notes")
    .select("manager_note,status,sent_at")
    .match(key(brandId, period, from, to))
    .maybeSingle();
  if (!data) return { note: "", status: "draft", sentAt: null };
  return { note: (data.manager_note as string) ?? "", status: (data.status as "draft" | "sent") ?? "draft", sentAt: (data.sent_at as string) ?? null };
}

export async function saveReportNote(brandId: string, period: ReportPeriod, from: string, to: string, note: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase()
    .from("client_report_notes")
    .upsert({ ...key(brandId, period, from, to), manager_note: note, updated_at: new Date().toISOString() }, { onConflict: "brand_id,period,from_date,to_date" });
  if (error) throw new Error(error.message);
}

export async function markReportSent(brandId: string, period: ReportPeriod, from: string, to: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase()
    .from("client_report_notes")
    .upsert({ ...key(brandId, period, from, to), status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "brand_id,period,from_date,to_date" });
  if (error) throw new Error(error.message);
}
