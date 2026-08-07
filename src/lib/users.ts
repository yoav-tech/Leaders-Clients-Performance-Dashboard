// Dashboard user records (per-client access control). Stored in Supabase `dashboard_users`,
// surrogate uuid `id` PK (so username stays editable). Login is by username OR email. Node-only.
import { getSupabase, hasDb } from "./db";
import type { Role } from "./session";

// "admin" is the reserved team username (verified against DASHBOARD_PASSWORD, no DB row).
export const RESERVED_USERNAMES = new Set(["admin"]);
export const normUsername = (v: string) => v.trim().toLowerCase();
export const MAX_TEAM = 3; // a primary client may invite up to 3 team members

export interface DashboardUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  passwordHash: string | null; // null = invited, not yet activated
  role: Role;
  brandIds: string[];
  invitedBy: string | null; // primary client's id, for team members
}

// Public-safe summary for admin/team UIs (no password hash).
export interface UserSummary {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  brandIds: string[];
  pending: boolean; // invited but hasn't onboarded/set a password yet
}

const SELECT = "id,username,email,full_name,phone,password_hash,role,brand_ids,invited_by";

function mapRow(d: Record<string, unknown>): DashboardUser {
  return {
    id: String(d.id),
    username: String(d.username),
    email: d.email == null ? null : String(d.email),
    fullName: d.full_name == null ? null : String(d.full_name),
    phone: d.phone == null ? null : String(d.phone),
    passwordHash: d.password_hash == null ? null : String(d.password_hash),
    role: d.role === "admin" ? "admin" : "client",
    brandIds: Array.isArray(d.brand_ids) ? d.brand_ids.map(String) : [],
    invitedBy: d.invited_by == null ? null : String(d.invited_by),
  };
}
const toSummary = (u: DashboardUser): UserSummary => ({
  id: u.id, username: u.username, email: u.email, fullName: u.fullName, role: u.role, brandIds: u.brandIds, pending: u.passwordHash == null,
});

export async function getUserById(id: string): Promise<DashboardUser | null> {
  if (!hasDb() || !id) return null;
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
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
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).or(`username.eq.${id},email.eq.${id}`).limit(1).maybeSingle();
  return data ? mapRow(data) : null;
}

export async function listUsers(): Promise<UserSummary[]> {
  if (!hasDb()) return [];
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).order("username");
  return (data ?? []).map((d) => toSummary(mapRow(d)));
}

// Create (or re-invite) a client with no password yet. Returns the row id (for the invite token).
export async function createInvitedUser(username: string, role: Role, brandIds: string[], invitedBy: string | null = null): Promise<string | null> {
  const { data } = await getSupabase()
    .from("dashboard_users")
    .upsert(
      { username: normUsername(username), role, brand_ids: brandIds, invited_by: invitedBy, password_hash: null, invited_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "username" },
    )
    .select("id")
    .single();
  return data ? String(data.id) : null;
}

// Onboarding: set profile + password, activating the account.
export async function activateUser(id: string, profile: { fullName: string; email: string; phone: string; passwordHash: string }): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ full_name: profile.fullName, email: profile.email.trim().toLowerCase(), phone: profile.phone, password_hash: profile.passwordHash, invited_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function setUserPassword(id: string, passwordHash: string): Promise<void> {
  await getSupabase().from("dashboard_users").update({ password_hash: passwordHash, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function updateUserBrands(id: string, role: Role, brandIds: string[]): Promise<void> {
  await getSupabase().from("dashboard_users").update({ role, brand_ids: brandIds, updated_at: new Date().toISOString() }).eq("id", id);
}

// Self-service profile edit (username/email/name/phone).
export async function updateProfile(id: string, p: { username: string; email: string; fullName: string; phone: string }): Promise<void> {
  await getSupabase()
    .from("dashboard_users")
    .update({ username: normUsername(p.username), email: p.email.trim().toLowerCase(), full_name: p.fullName, phone: p.phone, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteUser(id: string): Promise<void> {
  await getSupabase().from("dashboard_users").delete().eq("id", id);
}

// Uniqueness checks (exclude the row being edited).
export async function emailTakenByOther(email: string, exceptId: string): Promise<boolean> {
  if (!hasDb() || !email) return false;
  const { data } = await getSupabase().from("dashboard_users").select("id").eq("email", email.trim().toLowerCase()).neq("id", exceptId).limit(1);
  return (data ?? []).length > 0;
}
export async function usernameTakenByOther(username: string, exceptId: string): Promise<boolean> {
  if (!hasDb()) return false;
  const { data } = await getSupabase().from("dashboard_users").select("id").eq("username", normUsername(username)).neq("id", exceptId).limit(1);
  return (data ?? []).length > 0;
}

// Team (members a primary client invited).
export async function listTeam(primaryId: string): Promise<UserSummary[]> {
  if (!hasDb()) return [];
  const { data } = await getSupabase().from("dashboard_users").select(SELECT).eq("invited_by", primaryId).order("username");
  return (data ?? []).map((d) => toSummary(mapRow(d)));
}
export async function countTeam(primaryId: string): Promise<number> {
  if (!hasDb()) return 0;
  const { count } = await getSupabase().from("dashboard_users").select("id", { count: "exact", head: true }).eq("invited_by", primaryId);
  return count ?? 0;
}
