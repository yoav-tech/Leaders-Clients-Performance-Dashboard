// Snapshots of external spreadsheets, captured on a schedule.
//
// The dashboard reads the stored snapshot rather than Google directly, so a page render never
// depends on the sheet being reachable and a broken share link can't blank a client's report.
import { getSupabase, hasDb } from "./db";

export interface Snapshot<T> { payload: T; capturedAt: string }

export async function getSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  if (!hasDb()) return null;
  const { data, error } = await getSupabase()
    .from("sheet_snapshots")
    .select("payload,captured_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`snapshot lookup failed: ${error.message}`);
  if (!data) return null;
  return { payload: data.payload as T, capturedAt: String(data.captured_at) };
}

export async function saveSnapshot<T>(key: string, payload: T): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase()
    .from("sheet_snapshots")
    .upsert({ key, payload, captured_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export const HAAT_WEEKLY_KEY = "haat/weekly-registration";
