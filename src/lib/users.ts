// Dashboard user records (per-client access control). Stored in Supabase `dashboard_users`,
// accessed via the service-role client. Node-only.
import { getSupabase, hasDb } from "./db";
import type { Role } from "./session";

export interface DashboardUser {
  email: string;
  passwordHash: string | null; // null = invited, not yet activated
  role: Role;
  brandIds: string[];
}

// Public-safe user summary for the admin UI (no password hash).
export interface UserSummary {
  email: string;
  role: Role;
  brandIds: string[];
  pending: boolean; // true = invited but hasn't set a password yet
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
    passwordHash: data.password_hash == null ? null : String(data.password_hash),
    role: data.role === "admin" ? "admin" : "client",
    brandIds: Array.isArray(data.brand_ids) ? data.brand_ids.map(String) : [],
  };
}

export async function listUsers(): Promise<UserSummary[]> {
  if (!hasDb()) return [];
  const { data } = await getSupabase()
    .from("dashboard_users")
    .select("email,role,brand_ids,password_hash")
    .order("email");
  return (data ?? []).map((d) => ({
    email: String(d.email),
    role: d.role === "admin" ? "admin" : "client",
    brandIds: Array.isArray(d.brand_ids) ? d.brand_ids.map(String) : [],
    pending: d.password_hash == null,
  }));
}

// Create or replace an invited user with no password yet (activated when they accept the invite).
export async function createInvitedUser(email: string, role: Role, brandIds: string[]): Promise<void> {
  await getSupabase().from("dashboard_users").upsert(
    {
      email: email.trim().toLowerCase(),
      password_hash: null,
      role,
      brand_ids: brandIds,
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );
}

export async function updateUserBrands(email: string, role: Role, brandIds: string[]): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ role, brand_ids: brandIds, updated_at: new Date().toISOString() })
    .eq("email", email.trim().toLowerCase());
}

export async function deleteUser(email: string): Promise<void> {
  await getSupabase().from("dashboard_users").delete().eq("email", email.trim().toLowerCase());
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
    .update({ password_hash: passwordHash, invited_at: null, updated_at: new Date().toISOString() })
    .eq("email", email.trim().toLowerCase());
}
