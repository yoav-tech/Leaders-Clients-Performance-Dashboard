// Creates the dashboard tables. Run: npm run db:setup
// Requires DATABASE_URL (or POSTGRES_URL); .env.local is loaded via the npm script flag.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

// Split the DDL into statements on a trailing semicolon — but NOT inside a $$ … $$ block.
// The idempotency guards are written as `DO $$ BEGIN … EXCEPTION … END $$;`, and their inner
// lines end in semicolons too; splitting on those tears the block in half and Postgres rejects
// the pieces with "unterminated dollar-quoted string". Tracking whether we are inside a
// dollar-quoted body is what makes the guarded blocks survive the split.
function splitStatements(ddl: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (const line of ddl.split("\n")) {
    buf += line + "\n";
    // An odd number of $$ on a line flips us into or out of a dollar-quoted body.
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;[ \t]*$/.test(line)) {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) first.");
  const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });
  const ddl = readFileSync(join(process.cwd(), "scripts", "schema.sql"), "utf8");

  const statements = splitStatements(ddl);
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
