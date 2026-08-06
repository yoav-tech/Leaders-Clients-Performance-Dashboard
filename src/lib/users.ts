// Dashboard user records (per-client access control). Stored in Supabase `dashboard_users`,
// accessed via the service-role client. Node-only.
import { getSupabase, hasDb } from "./db";
import type { Role } from "./session";

export interface DashboardUser {
  email: string;
  passwordHash: string;
  role: Role;
  brandIds: string[];
}

export async function getUserByEmail(email: string): Promise<DashboardUser | null> {
  if (!hasDb()) return null;
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const { data, error } = await getSupabase()
    .from("dashboard_users")
    .select("email,password_hash,role,brand_ids")
    .eq("email", e)
    .maybeSingle();
  if (error || !data) return null;
  return {
    email: String(data.email),
    passwordHash: String(data.password_hash),
    role: data.role === "admin" ? "admin" : "client",
    brandIds: Array.isArray(data.brand_ids) ? data.brand_ids.map(String) : [],
  };
}

export async function upsertUser(u: { email: string; passwordHash: string; role: Role; brandIds: string[] }): Promise<void> {
  await getSupabase().from("dashboard_users").upsert(
    {
      email: u.email.trim().toLowerCase(),
      password_hash: u.passwordHash,
      role: u.role,
      brand_ids: u.brandIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );
}

export async function setUserPassword(email: string, passwordHash: string): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("email", email.trim().toLowerCase());
}
