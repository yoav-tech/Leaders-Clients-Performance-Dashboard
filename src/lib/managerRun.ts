// Build + send the per-brand account-manager emails for a period (weekly / monthly).
import { BRANDS } from "./brands";
import { today, shiftDate } from "./dates";
import { emailConfigured, sendEmail } from "./email";
import { brandManagers } from "./recipients";
import { getManagerReport } from "./managerReport";
import { generateConclusions, conclusionsConfigured } from "./conclusions";
import { renderManagerHtml, renderManagerText, managerSubject } from "./managerEmail";

function rangeFor(period: "week" | "month"): { from: string; to: string } {
  const t = today();
  if (period === "week") return { from: shiftDate(t, -7), to: shiftDate(t, -1) }; // last 7 full days
  const monthStart = t.slice(0, 8) + "01";
  const to = shiftDate(monthStart, -1); // last day of previous calendar month
  return { from: to.slice(0, 8) + "01", to };
}

export async function sendManagerReports(
  period: "week" | "month",
  opts: { dry?: boolean; onlyBrand?: string; overrideTo?: string } = {},
): Promise<{ range: { from: string; to: string }; brands: string[]; sent: string[]; preview?: string }> {
  const range = rangeFor(period);
  const brandsWithMgr: string[] = [];
  const sent: string[] = [];
  let preview: string | undefined;

  for (const brand of BRANDS) {
    if (opts.onlyBrand && brand.id !== opts.onlyBrand) continue;
    const to = opts.overrideTo ? [opts.overrideTo] : brandManagers(brand.id);
    if (!to.length) continue;
    brandsWithMgr.push(brand.id);
    try {
      const report = await getManagerReport(brand, range.from, range.to, period);
      const conclusions = conclusionsConfigured() ? await generateConclusions(report) : [];
      if (opts.dry) {
        if (!preview) preview = renderManagerText(report, conclusions);
        continue;
      }
      if (!emailConfigured()) continue;
      await sendEmail({ to, subject: managerSubject(report), html: renderManagerHtml(report, conclusions), text: renderManagerText(report, conclusions) });
      sent.push(brand.id);
    } catch (e) {
      console.error("[managerReports]", period, brand.id, e instanceof Error ? e.message : String(e));
    }
  }
  return { range, brands: brandsWithMgr, sent, preview };
}
