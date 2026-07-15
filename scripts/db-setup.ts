// Creates the dashboard tables. Run: npm run db:setup
// Requires DATABASE_URL (or POSTGRES_URL); .env.local is loaded via the npm script flag.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) first.");
  const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });
  const ddl = readFileSync(join(process.cwd(), "scripts", "schema.sql"), "utf8");

  // Split on semicolons at statement ends; run each statement via sql.unsafe (raw string).
  const statements = ddl
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
  await sql.end();
  console.log(`✓ Applied ${statements.length} statements.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
