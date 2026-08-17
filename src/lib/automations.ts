// Automations registry + on/off state + owner gating for the super-admin automations console.
// "Automations" are the scheduled cron jobs (emails, reports, reminders, ingest). The owner can
// view them, toggle each on/off (honored by cronAuth), and trigger one manually.
import { getSupabase, hasDb } from "./db";
import { getUserById } from "./users";
import type { Session } from "./session";

export interface Automation {
  key: string; // == the cronAuth label, e.g. "cron/digest"
  path: string; // the endpoint to trigger
  name: string; // Hebrew display name
  schedule: string; // cron expression (from vercel.json) — display only
  scheduleHe: string; // human-readable schedule
  description: string;
}

// Kept in sync with vercel.json crons. Order = display order.
export const AUTOMATIONS: Automation[] = [
  { key: "cron/digest", path: "/api/cron/digest", name: "דוח יומי / שבועי", schedule: "0 7,8 * * 0-4", scheduleHe: "כל יום א׳–ה׳ ב־10:00 (שבועי בראשון) · מייל + ClickUp", description: "סיכום ביצועים יומי לצוות; בראשון כולל תזכורת סיכום שבועי ללקוחות." },
  { key: "cron/report-reminder", path: "/api/cron/report-reminder", name: "תזכורת סיכום חודשי", schedule: "0 7,8 1 * *", scheduleHe: "ב־1 לכל חודש, 10:00", description: "מייל למנהל להוציא את סיכום החודש ללקוחות." },
  { key: "cron/weekly", path: "/api/cron/weekly", name: "דוח מנהל שבועי", schedule: "0 5 * * 4", scheduleHe: "כל יום חמישי", description: "דוח ביצועים פר-מותג למנהלי המדיה." },
  { key: "cron/monthly", path: "/api/cron/monthly", name: "דוח מנהל חודשי", schedule: "0 5 1 * *", scheduleHe: "ב־1 לכל חודש", description: "דוח חודשי פר-מותג עבור החודש הקודם." },
  { key: "cron/alerts", path: "/api/cron/alerts", name: "התראות ביצועים", schedule: "0 5-17/2 * * *", scheduleHe: "כל שעתיים במהלך היום", description: "התראות בריאות-חשבון וביצועים ל־ClickUp." },
  { key: "cron/media-plan", path: "/api/cron/media-plan", name: "תוכניות מדיה חודשיות", schedule: "0 5 24 * *", scheduleHe: "ב־24 לכל חודש", description: "בניית טיוטות תוכנית מדיה לחודש הבא." },
  { key: "cron/clickup-poll", path: "/api/cron/clickup-poll", name: "ClickUp · שאלות ותשובות", schedule: "*/10 * * * *", scheduleHe: "כל 10 דקות", description: "עונה לשאלות בערוץ ClickUp (טריגר ‎ask:‎)." },
];

export const automationByKey = (key: string): Automation | undefined => AUTOMATIONS.find((a) => a.key === key);

// --- on/off state (automation_settings) ---
export async function automationEnabled(key: string): Promise<boolean> {
  if (!hasDb()) return true; // no DB → nothing to disable; behave as before
  const { data } = await getSupabase().from("automation_settings").select("enabled").eq("key", key).maybeSingle();
  return data ? data.enabled !== false : true; // default ON when no row
}

export async function enabledMap(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = Object.fromEntries(AUTOMATIONS.map((a) => [a.key, true]));
  if (!hasDb()) return out;
  const { data } = await getSupabase().from("automation_settings").select("key,enabled");
  for (const r of data ?? []) if (r.key in out) out[r.key] = r.enabled !== false;
  return out;
}

export async function setAutomationEnabled(key: string, enabled: boolean): Promise<void> {
  if (!hasDb()) return;
  const { error } = await getSupabase()
    .from("automation_settings")
    .upsert({ key, enabled, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// --- owner gating ---
// The super-admin(s) who manage automations. OWNER_USERS is a comma-separated allow-list matched
// against each user's username OR email. A logged-in user is an owner iff they match. The shared
// "admin" login (Gal) has no DB row, so it is never an owner — only the listed super-admin (yoav).
export async function isOwner(session: Session | null): Promise<boolean> {
  if (!session) return false;
  const owners = (process.env.OWNER_USERS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!owners.length) return false;
  const me = await getUserById(session.sub).catch(() => null);
  if (!me) return false;
  return owners.includes(me.username.toLowerCase()) || (!!me.email && owners.includes(me.email.toLowerCase()));
}
