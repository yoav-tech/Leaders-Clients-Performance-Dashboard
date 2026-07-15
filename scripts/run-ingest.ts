// Manual ingestion runner. Run:
//   npm run ingest                 # today only
//   npm run ingest -- 2026-06-15 2026-07-15   # backfill a date range
// Reads .env.local (via --env-file-if-exists in the npm script) for DATABASE_URL / WINDSOR_API_KEY.
import { runIngest } from "../src/lib/ingest";

async function main() {
  const [from, to] = process.argv.slice(2);
  const result = await runIngest({ from, to });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
