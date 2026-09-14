// npm run check:coverage — is every active client reaching every recurring report?
//
// Run this after adding a client. It prints the full matrix and exits non-zero when a client is
// missing from something it should be in, so it also works as a CI gate.
import { getReportCoverage, REPORT_LABEL_HE, type ReportId } from "../src/lib/reportCoverage";

const REPORTS: ReportId[] = ["ingest", "digest", "weekly", "monthly", "media-plan", "store-products", "alerts"];
const MARK = { covered: "✓", "n/a": "·", gap: "✗" } as const;

function pad(s: string, w: number): string {
  // Hebrew and ✓/✗ are one column each in a terminal, so a plain length works here.
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

async function main() {
  const coverage = await getReportCoverage();
  const nameW = Math.max(6, ...coverage.map((c) => c.brandName.length));
  const heads = REPORTS.map((r) => r.padStart(0));
  const colW = heads.map((h) => Math.max(h.length, 3));

  console.log(`\n${pad("brand", nameW)}  ${pad("group", 10)}  ${heads.map((h, i) => pad(h, colW[i])).join("  ")}`);
  console.log("-".repeat(nameW + 14 + colW.reduce((a, b) => a + b + 2, 0)));

  for (const b of coverage) {
    const cells = REPORTS.map((r, i) => {
      const c = b.cells.find((x) => x.report === r);
      return pad(c ? MARK[c.status] : "?", colW[i]);
    });
    console.log(`${pad(b.brandName, nameW)}  ${pad(b.group, 10)}  ${cells.join("  ")}`);
  }
  console.log(`\n  ✓ covered   · not applicable   ✗ gap\n`);

  const gaps = coverage.flatMap((b) => b.cells.filter((c) => c.status === "gap").map((c) => ({ b, c })));
  if (!gaps.length) {
    console.log("Every active client reaches every recurring report.\n");
    return;
  }
  console.log(`${gaps.length} gap(s):\n`);
  for (const { b, c } of gaps) console.log(`  ✗ ${b.brandName} · ${REPORT_LABEL_HE[c.report]} — ${c.reason}`);
  console.log();
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
