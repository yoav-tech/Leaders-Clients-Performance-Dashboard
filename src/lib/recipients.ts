// Who receives each outgoing email.
//
// Brand managers come from the permissions console (`dashboard_users`, role='manager'), so
// attaching a manager to a brand there is all it takes for that brand's reports and media plans
// to reach them — there is no second list to keep in sync. A manager with no email on file yet
// (invited but not onboarded) is skipped rather than silently dropping the send.
import { getSupabase, hasDb } from "./db";

// Media managers — the internal team that reviews and approves. Overridable via
// EMAIL_MEDIA_MANAGERS (comma-separated) without a code change.
export function mediaManagers(): string[] {
  const env = process.env.EMAIL_MEDIA_MANAGERS;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return ["yoav@ldrsgroup.com", "gal.z@ldrsgroup.com"];
}

const envOverride = (brandId: string): string[] | null => {
  const v = process.env[`EMAIL_MANAGER_${brandId.toUpperCase().replace(/-/g, "_")}`];
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null;
};

// The brand's manager(s): every onboarded user with role='manager' whose brand list includes
// this brand. EMAIL_MANAGER_<BRAND_ID> is an escape hatch for testing and takes precedence.
export async function brandManagers(brandId: string): Promise<string[]> {
  const override = envOverride(brandId);
  if (override) return override;
  if (!hasDb()) return [];
  const { data, error } = await getSupabase()
    .from("dashboard_users")
    .select("email,role,brand_ids")
    .eq("role", "manager")
    .contains("brand_ids", [brandId])
    .limit(50);
  if (error) throw new Error(`brand managers lookup failed: ${error.message}`);
  return [...new Set((data ?? []).map((r) => String(r.email ?? "").trim().toLowerCase()).filter(Boolean))];
}

// Same lookup for every brand at once — one round-trip for the whole console / cron run.
export async function brandManagersByBrand(brandIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = Object.fromEntries(brandIds.map((b) => [b, []]));
  for (const b of brandIds) {
    const override = envOverride(b);
    if (override) out[b] = override;
  }
  if (!hasDb()) return out;
  const { data, error } = await getSupabase().from("dashboard_users").select("email,brand_ids").eq("role", "manager").limit(500);
  if (error) throw new Error(`brand managers lookup failed: ${error.message}`);
  for (const row of data ?? []) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!email) continue; // invited but not onboarded yet
    for (const b of (row.brand_ids as string[] | null) ?? []) {
      if (!(b in out) || envOverride(b)) continue;
      if (!out[b].includes(email)) out[b].push(email);
    }
  }
  return out;
}
