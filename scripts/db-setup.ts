// Creates the dashboard tables. Run: npm run db:setup
// Requires DATABASE_URL (or POSTGRES_URL); .env.local is loaded via the npm script flag.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) first.");
  const sql = neon(url);
  const ddl = readFileSync(join(process.cwd(), "scripts", "schema.sql"), "utf8");

  // Split on semicolons at statement ends; run each statement.
  const statements = ddl
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  // This neon (HTTP) build exposes only the tagged-template call, not sql.query().
  // Wrap each raw DDL string as a no-interpolation template literal.
  const runRaw = (q: string) => sql(Object.assign([q], { raw: [q] }) as unknown as TemplateStringsArray);
  for (const stmt of statements) {
    await runRaw(stmt);
  }
  console.log(`✓ Applied ${statements.length} statements.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
