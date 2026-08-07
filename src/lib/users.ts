// Dashboard user records (per-client access control). Stored in Supabase `dashboard_users`,
// keyed by username. Login is by username OR email. Node-only.
import { getSupabase, hasDb } from "./db";
import type { Role } from "./session";

// "admin" is the reserved team username (verified against DASHBOARD_PASSWORD, no DB row).
export const RESERVED_USERNAMES = new Set(["admin"]);
export const normUsername = (v: string) => v.trim().toLowerCase();

export interface DashboardUser {
  username: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  passwordHash: string | null; // null = invited, not yet activated
  role: Role;
  brandIds: string[];
}

// Public-safe user summary for the admin UI (no password hash).
export interface UserSummary {
  username: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  brandIds: string[];
  pending: boolean; // invited but hasn't onboarded/set a password yet
}

const SELECT = "username,email,full_name,phone,password_hash,role,brand_ids";

function mapRow(d: Record<string, unknown>): DashboardUser {
  return {
    username: String(d.username),
    email: d.email == null ? null : String(d.email),
    fullName: d.full_name == null ? null : String(d.full_name),
    phone: d.phone == null ? null : String(d.phone),
    passwordHash: d.password_hash == null ? null : String(d.password_hash),
    role: d.role === "admin" ? "admin" : "client",
    brandIds: Array.isArray(d.brand_ids) ? d.brand_ids.map(String) : [],
  };
}

export async function getUserByUsername(username: string): Promise<DashboardUser | null> {
  if (!hasDb()) return null;
  const u = normUsername(username);
  if (!u) return null;
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).eq("username", u).maybeSingle();
  return data ? mapRow(data) : null;
}

// Login lookup: match a username OR an email (both stored lowercased).
export async function getUserByIdentifier(identifier: string): Promise<DashboardUser | null> {
  if (!hasDb()) return null;
  const id = identifier.trim().toLowerCase();
  if (!id) return null;
  const { data } = await getSupabase()
    .from("dashboard_users")
    .select(SELECT)
    .or(`username.eq.${id},email.eq.${id}`)
    .limit(1)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listUsers(): Promise<UserSummary[]> {
  if (!hasDb()) return [];
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).order("username");
  return (data ?? []).map((d) => {
    const u = mapRow(d);
    return { username: u.username, email: u.email, fullName: u.fullName, role: u.role, brandIds: u.brandIds, pending: u.passwordHash == null };
  });
}

// Create an invited client (username + brands only). The rest is filled at onboarding.
export async function createInvitedUser(username: string, role: Role, brandIds: string[]): Promise<void> {
  await getSupabase().from("dashboard_users").upsert(
    {
      username: normUsername(username),
      role,
      brand_ids: brandIds,
      password_hash: null,
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "username" },
  );
}

// Onboarding: set the client's profile + password, activating the account.
export async function activateUser(
  username: string,
  profile: { fullName: string; email: string; phone: string; passwordHash: string },
): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({
      full_name: profile.fullName,
      email: profile.email.trim().toLowerCase(),
      phone: profile.phone,
      password_hash: profile.passwordHash,
      invited_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("username", normUsername(username));
}

export async function setUserPassword(username: string, passwordHash: string): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq("username", normUsername(username));
}

export async function updateUserBrands(username: string, role: Role, brandIds: string[]): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ role, brand_ids: brandIds, updated_at: new Date().toISOString() })
    .eq("username", normUsername(username));
}

export async function deleteUser(username: string): Promise<void> {
  await getSupabase().from("dashboard_users").delete().eq("username", normUsername(username));
}

// Is this email already used by another user (for onboarding uniqueness)?
export async function emailTakenByOther(email: string, username: string): Promise<boolean> {
  if (!hasDb()) return false;
  const { data } = await getSupabase()
    .from("dashboard_users")
    .select("username")
    .eq("email", email.trim().toLowerCase())
    .neq("username", normUsername(username))
    .limit(1);
  return (data ?? []).length > 0;
}
