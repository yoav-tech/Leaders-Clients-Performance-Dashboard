import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The app and ingestion talk to Supabase over its HTTP Data API (PostgREST). This
// works from Vercel over plain HTTPS — no connection pooler or IPv6 direct host needed.
// (The local db:setup script uses a direct postgres.js connection for DDL instead.)

export function hasDb(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _sb: SupabaseClient | null = null;

// Server-side Supabase client using the service-role key (bypasses RLS). Never import
// this into client components — the key must stay server-only.
export function getSupabase(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}
