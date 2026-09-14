// Build + send the per-brand account-manager emails for a period (weekly / monthly).
import { BRANDS } from "./brands";
import { today, shiftDate } from "./dates";
import { emailConfigured, sendEmail } from "./email";
import { brandManagers, mediaManagers } from "./recipients";
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
): Promise<{ range: { from: string; to: string }; brands: string[]; sent: string[]; unattached: string[]; preview?: string }> {
  const range = rangeFor(period);
  const brandsWithMgr: string[] = [];
  const fellBackToMediaManagers: string[] = [];
  const sent: string[] = [];
  let preview: string | undefined;

  for (const brand of BRANDS) {
    if (opts.onlyBrand && brand.id !== opts.onlyBrand) continue;
    if (brand.retired) continue; // retired client — data kept, no reports sent

    // A brand with nobody attached in the permissions console used to be skipped outright, so a new
    // client silently got no weekly or monthly report until someone remembered to attach a manager.
    // That had quietly swallowed nine of thirteen active brands. The media managers are the backstop
    // now: the report always goes out, and reportCoverage flags the missing attachment in the daily
    // digest so it gets fixed rather than staying invisible.
    const attached = opts.overrideTo ? [opts.overrideTo] : await brandManagers(brand.id);
    const to = attached.length ? attached : mediaManagers();
    if (!to.length) continue;
    if (!attached.length) fellBackToMediaManagers.push(brand.id);
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
  return { range, brands: brandsWithMgr, sent, unattached: fellBackToMediaManagers, preview };
}
