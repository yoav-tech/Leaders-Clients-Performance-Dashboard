import postgres from "postgres";

// Postgres connection (Supabase). Reads DATABASE_URL (or POSTGRES_URL). Until it's set,
// hasDb() is false and the read/ingest layers no-op so the app still builds/deploys empty.
//
// Use Supabase's *Transaction pooler* connection string (port 6543) on Vercel serverless.
// prepare:false is required for the transaction pooler (pgBouncer); ssl:'require' for Supabase.

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

let _sql: ReturnType<typeof postgres> | null = null;

// Memoised singleton — postgres.js manages a connection pool, so never create per-call.
export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("No database URL configured (DATABASE_URL / POSTGRES_URL)");
  _sql = postgres(url, {
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
    max: 1,
  });
  return _sql;
}

// Close the pool so CLI scripts can exit. Not used by the serverless app.
export async function endSql(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}
