import { neon } from "@neondatabase/serverless";

// Reads DATABASE_URL (or POSTGRES_URL) from the environment. Until the DB is
// provisioned, hasDb() is false and the read/ingest layers no-op so the app still
// builds and deploys with an empty state.
export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

// Lazily create the Neon SQL tagged-template client. Neon's `sql\`...\`` returns the
// rows array directly (no { rows } wrapper).
export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL configured (DATABASE_URL / POSTGRES_URL)");
  return neon(url);
}
