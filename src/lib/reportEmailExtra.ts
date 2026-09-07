// Monthly summary emails for the brand types that had no template: video/awareness brands
// (Style, Protein Max, Chery, Xpeng, SCJ), the app brand (Haat) and the search-share brand
// (Colgate). Same shell as the e-commerce and leads reports so every client gets one look.
import type { BrandConfig } from "./brands";
import type { CampBrandMetrics } from "./campaignMetrics";
import type { AppReport } from "./appReport";
import type { SnapSection } from "./searchSnapshot";
import { periodLabel, type ClientReport } from "./clientReport";
import type { TopProductsResult } from "./topProducts";
import type { Insight } from "./reportInsights";

const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const ils2 = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(3)}`);
const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const pctv = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

const pth = (t: string, right = false) =>
  `<th style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 11px/1.2 ${F};color:#6b7280;text-align:${right ? "right" : "left"};white-space:nowrap"${right ? "" : ' dir="ltr"'}>${t}</th>`;
const ptd = (t: string, b = false) =>
  `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:${b ? 600 : 400} 13px/1.3 ${F};color:#1a1d26;text-align:left;white-space:nowrap" dir="ltr">${t}</td>`;
const prd = (t: string) =>
  `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:right;white-space:nowrap">${t}</td>`;
const pill = (l: string, v: string) =>
  `<span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">${l} <b style="color:#1a1d26">${v}</b></span>`;

function shell(titleHe: string, from: string, to: string, pills: string, body: string, note: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">סיכום חודשי · ${esc(titleHe)} · ${esc(periodLabel(from, to))}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${pills}</div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      ${body}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #ececf3;color:#6b7280;font-size:11px">Leaders · Powered by People</div>
  </div></body></html>`;
}

const head = (t: string) =>
  `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px">${t}</div>`;
const table = (rows: string) => `<table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>`;

const CH_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };

// Target chrome. Green when we're at or better than goal, red when we're not — a target with no
// verdict beside it makes the reader do the arithmetic, which is how targets get ignored.
const GOOD_C = "#0f6e6e", BAD_C = "#d5202e";
function verdict(ok: boolean | null): string {
  if (ok == null) return "";
  return `<span style="color:${ok ? GOOD_C : BAD_C};font-weight:700">${ok ? "✓ ביעד" : "✗ מעל היעד"}</span>`;
}
// A cost metric passes when it is at or below target; a volume metric when at or above.
const okCost = (actual: number | null, target: number | null) => (actual == null || target == null ? null : actual <= target);
const attain = (actual: number | null, target: number | null) =>
  actual == null || !target ? null : (actual / target) * 100;
const pctAttain = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

// Conclusions block. Deliberately placed above the tables: the recommendation is the point of the
// email, the tables are the evidence for it.
export function insightsBlock(items: Insight[]): string {
  if (!items.length) return "";
  const chrome: Record<Insight["severity"], { bar: string; chip: string; label: string }> = {
    critical: { bar: BAD_C, chip: "#fbe7e8", label: "לטיפול מיידי" },
    warn: { bar: "#b8730c", chip: "#fdf3e3", label: "לשים לב" },
    good: { bar: GOOD_C, chip: "#e0efef", label: "הזדמנות" },
  };
  const cards = items.map((it) => {
    const c = chrome[it.severity];
    return `<tr><td style="padding:0 0 10px 0">
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #ececf3;border-radius:12px;overflow:hidden">
        <tr>
          <td width="4" style="background:${c.bar}"></td>
          <td style="padding:12px 14px">
            <div style="margin-bottom:5px"><span style="background:${c.chip};color:${c.bar};font:700 10px/1 ${F};padding:4px 8px;border-radius:999px;letter-spacing:.04em">${c.label}</span></div>
            <div style="font:700 14px/1.35 ${F};color:#1a1d26">${it.title}</div>
            <div style="margin-top:4px;font:400 12.5px/1.5 ${F};color:#6b7280">${it.evidence}</div>
            <div style="margin-top:7px;padding-top:7px;border-top:1px dashed #ececf3;font:600 12.5px/1.5 ${F};color:#1a1d26">← ${it.action}</div>
          </td>
        </tr>
      </table></td></tr>`;
  }).join("");
  return head("מסקנות והמלצות") + `<table role="presentation" width="100%" style="border-collapse:collapse">${cards}</table>`;
}

function targetBanner(rows: { label: string; actual: string; target: string; ok: boolean | null; note?: string }[]): string {
  const cells = rows.map((r) =>
    `<tr>
       <td style="padding:8px 10px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:right">${r.label}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #ececf3;font:700 14px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${r.actual}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#6b7280;text-align:left" dir="ltr">יעד ${r.target}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #ececf3;font:400 12px/1.3 ${F};text-align:left">${verdict(r.ok)}${r.note ? `<div style="color:#6b7280;font-size:11px">${r.note}</div>` : ""}</td>
     </tr>`).join("");
  return head("עמידה ביעדים") +
    `<table role="presentation" width="100%" style="border-collapse:collapse;background:#fbfaff;border:1px solid #ececf3;border-radius:12px">${cells}</table>`;
}

// ---- Video / awareness brands (Style, Protein Max, Chery, Xpeng, SCJ) ----
export interface PlanRow { title: string; budget: number; spend: number; spendPct: number | null; target: number; actual: number; pct: number | null; unit: string }
export interface AdRow { name: string; spend: number; views: number; cpv: number | null }
export interface LeadsBlock { leads: number; cpl: number | null; targetLeads: number; targetCpa: number }

export function renderViewsEmail(
  brand: BrandConfig, m: CampBrandMetrics, note: string, from: string, to: string,
  extra?: { plan?: PlanRow[]; ads?: AdRow[]; leads?: LeadsBlock; flight?: string; insights?: Insight[] },
): string {
  const t = m.total;
  const targetCpv = brand.targetCpv ?? null;
  const pills =
    pill("הוצאה", ils(t.spend)) + pill("חשיפות", n0(t.impressions)) + pill("Reach", n0(t.reach)) +
    pill("ThruPlay", n0(t.views)) + pill("עלות ל-ThruPlay", ils2(t.cpv)) +
    (t.views3s ? pill("צפיות 3 שניות", n0(t.views3s)) : "");

  // Targets first — this is the answer the client is looking for.
  const targetRows: { label: string; actual: string; target: string; ok: boolean | null; note?: string }[] = [];
  if (targetCpv != null) {
    targetRows.push({
      label: "עלות לצפייה (ThruPlay)", actual: ils2(t.cpv), target: ils2(targetCpv),
      ok: okCost(t.cpv, targetCpv),
      note: t.cpv != null ? `${pctAttain(attain(t.cpv, targetCpv))} מהיעד` : undefined,
    });
  }
  if (extra?.leads) {
    const L = extra.leads;
    targetRows.push({ label: "לידים", actual: n0(L.leads), target: n0(L.targetLeads), ok: L.leads >= L.targetLeads,
      note: `${pctAttain((L.leads / L.targetLeads) * 100)} מהיעד` });
    targetRows.push({ label: "עלות לליד", actual: ils(L.cpl), target: ils(L.targetCpa), ok: okCost(L.cpl, L.targetCpa) });
  }
  const targets = targetRows.length ? targetBanner(targetRows) : "";

  const rows = m.channels.filter((c) => c.channel !== "total")
    .map((c) => `<tr>${prd(esc(CH_LABEL[c.channel] ?? c.channel))}${ptd(ils(c.spend))}${ptd(n0(c.impressions))}${ptd(n0(c.reach))}${ptd(c.views3s ? n0(c.views3s) : "—")}${ptd(n0(c.views), true)}${ptd(ils2(c.cpv), true)}</tr>`).join("");
  const totalRow = `<tr>${prd("סה״כ")}${ptd(ils(t.spend), true)}${ptd(n0(t.impressions), true)}${ptd(n0(t.reach), true)}${ptd(t.views3s ? n0(t.views3s) : "—", true)}${ptd(n0(t.views), true)}${ptd(ils2(t.cpv), true)}</tr>`;
  const platforms =
    head("לפי פלטפורמה") +
    table(`<tr>${pth("פלטפורמה", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("Reach")}${pth("3 שניות")}${pth("ThruPlay")}${pth("עלות ThruPlay")}</tr>${rows}${totalRow}`) +
    `<div style="margin-top:8px;color:#6b7280;font-size:11px">צפיות 3 שניות נמדדות במטא בלבד. ThruPlay = 15 שניות או סיום במטא, 6 שניות בטיקטוק.</div>`;

  // Plan vs execution — "פריסה מול ביצוע".
  const plan = extra?.plan?.length
    ? head(`פריסת מדיה מול ביצוע${extra.flight ? ` · ${esc(extra.flight)}` : ""}`) +
      table(`<tr>${pth("קו תכנון", true)}${pth("תקציב")}${pth("הוצאה")}${pth("% תקציב")}${pth("יעד צפיות")}${pth("בפועל")}${pth("% עמידה")}</tr>` +
        extra.plan.map((p) => {
          const ok = p.pct != null && p.pct >= 90;
          return `<tr>${prd(esc(p.title))}${ptd(ils(p.budget))}${ptd(ils(p.spend))}${ptd(pctAttain(p.spendPct))}${ptd(n0(p.target))}${ptd(n0(p.actual), true)}` +
            `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:700 13px/1.3 ${F};color:${p.pct == null ? "#6b7280" : ok ? GOOD_C : BAD_C};text-align:left" dir="ltr">${pctAttain(p.pct)}</td></tr>`;
        }).join("") +
        (() => {
          const P = extra.plan!;
          const b = P.reduce((a, x) => a + x.budget, 0), sp = P.reduce((a, x) => a + x.spend, 0);
          const tg = P.reduce((a, x) => a + x.target, 0), ac = P.reduce((a, x) => a + x.actual, 0);
          const pc = tg ? (ac / tg) * 100 : null;
          return `<tr>${prd("סה״כ")}${ptd(ils(b), true)}${ptd(ils(sp), true)}${ptd(b ? pctAttain((sp / b) * 100) : "—", true)}${ptd(n0(tg), true)}${ptd(n0(ac), true)}` +
            `<td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:${pc == null ? "#6b7280" : pc >= 90 ? GOOD_C : BAD_C};text-align:left" dir="ltr">${pctAttain(pc)}</td></tr>`;
        })())
    : "";

  const ads = extra?.ads?.length
    ? head("מודעות מובילות לפי צפיות") +
      table(`<tr>${pth("מודעה", true)}${pth("הוצאה")}${pth("צפיות")}${pth("עלות לצפייה")}</tr>` +
        extra.ads.map((a, i) => `<tr>${prd(`${i + 1}. ${esc(a.name)}`)}${ptd(ils(a.spend))}${ptd(n0(a.views), true)}` +
          `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:${targetCpv != null && a.cpv != null ? (a.cpv <= targetCpv ? GOOD_C : BAD_C) : "#1a1d26"};text-align:left" dir="ltr">${ils2(a.cpv)}</td></tr>`).join(""))
    : "";

  return shell(brand.nameHe, from, to, pills, insightsBlock(extra?.insights ?? []) + targets + platforms + plan + ads, note);
}

// ---- App brand (Haat) ----
// Built to the same depth as the e-commerce report: headline funnel, a per-activity table that
// uses each section's own KPIs (the recruitment section has leads, not installs), the top
// campaigns by registrations, and registrations by city.
export function renderAppEmail(
  brand: BrandConfig,
  r: AppReport,
  note: string,
  from: string,
  to: string,
  cityRows?: { city: string; spend: number; regs: number; cpr: number }[],
  insights: Insight[] = [],
): string {
  const app = r.sections.filter((s) => s.kind === "app");
  const hr = r.sections.filter((s) => s.kind === "leads");
  const sum = (xs: AppReport["sections"], f: (t: AppReport["sections"][number]["totals"]) => number) =>
    xs.reduce((a, s) => a + f(s.totals), 0);

  const spend = sum(r.sections, (t) => t.spend);
  const appSpend = sum(app, (t) => t.spend);
  const hrSpend = sum(hr, (t) => t.spend);
  const installs = sum(app, (t) => t.installs);
  const regs = sum(app, (t) => t.registrations);
  const leads = sum(hr, (t) => t.leads);
  const impressions = sum(r.sections, (t) => t.impressions);
  const clicks = sum(r.sections, (t) => t.clicks);

  const cpReg = regs ? appSpend / regs : null;
  const targetCpReg = brand.targetCpReg ?? null;
  const pills =
    pill("הוצאה", ils(spend)) +
    pill("התקנות", n0(installs)) +
    pill("הרשמות", n0(regs)) +
    pill("עלות להתקנה", ils(installs ? appSpend / installs : null)) +
    pill("עלות להרשמה", ils(cpReg)) +
    (leads ? pill("לידים · גיוס", n0(leads)) + pill("עלות לליד", ils(hrSpend / leads)) : "");

  const targets = targetCpReg == null ? "" : targetBanner([{
    label: "עלות להרשמה", actual: ils(cpReg), target: `עד ${ils(targetCpReg)}`,
    ok: okCost(cpReg, targetCpReg),
    note: cpReg != null ? `${pctAttain(attain(cpReg, targetCpReg))} מהתקרה` : undefined,
  }]);

  // Funnel — the app story in one line.
  const rate = installs ? (regs / installs) * 100 : null;
  const step = (label: string, value: string, sub: string) =>
    `<td style="padding:10px 12px;background:#f4f1ff;border:1px solid rgba(124,58,237,.18);border-radius:12px;text-align:center;font-family:${F}">
       <div style="font:700 20px/1.1 ${F};color:#1a1d26">${value}</div>
       <div style="margin-top:3px;font-size:11px;color:#6b7280">${label}</div>
       <div style="margin-top:2px;font-size:11px;color:#4f46e5">${sub}</div>
     </td>`;
  const arrow = `<td style="padding:0 6px;color:#c3d0d6;font-size:16px;text-align:center">←</td>`;
  const funnel =
    head("מסע המשתמש") +
    `<table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0"><tr>` +
    step("חשיפות", n0(impressions), "") + arrow +
    step("קליקים", n0(clicks), impressions ? `${((clicks / impressions) * 100).toFixed(2)}% CTR` : "") + arrow +
    step("התקנות", n0(installs), ils(installs ? appSpend / installs : null)) + arrow +
    step("הרשמות", n0(regs), rate == null ? "" : `${rate.toFixed(0)}% מההתקנות`) +
    `</tr></table>`;

  // Per-activity table, each section with the KPIs that actually apply to it.
  const secRow = (sec: AppReport["sections"][number]) => {
    const t = sec.totals;
    const isApp = sec.kind === "app";
    return `<tr>${prd(esc(sec.title))}${ptd(ils(t.spend))}${ptd(n0(t.impressions))}${ptd(n0(t.clicks))}` +
      `${ptd(isApp ? n0(t.installs) : "—")}${ptd(isApp ? n0(t.registrations) : n0(t.leads), true)}` +
      `${ptd(isApp ? ils(t.cpReg) : ils(t.cpLead), true)}</tr>`;
  };
  const activity =
    head("לפי פעילות") +
    table(`<tr>${pth("פעילות", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("קליקים")}${pth("התקנות")}${pth("הרשמות / לידים")}${pth("עלות ליחידה")}</tr>` +
      r.sections.map(secRow).join("")) +
    `<div style="margin-top:8px;color:#6b7280;font-size:11px">פעילות הגיוס נמדדת בלידים ולא בהתקנות, ולכן עמודת ההתקנות ריקה עבורה.</div>`;

  // Top campaigns by registrations — the equivalent of the top-ads table.
  const camps = app
    .flatMap((s) => s.campaigns)
    .filter((c) => c.registrations > 0)
    .sort((a, b) => b.registrations - a.registrations)
    .slice(0, 8);
  const campaigns = camps.length
    ? head("קמפיינים מובילים לפי הרשמות") +
      table(`<tr>${pth("קמפיין", true)}${pth("הוצאה")}${pth("התקנות")}${pth("הרשמות")}${pth("עלות להרשמה")}</tr>` +
        camps.map((c, i) => `<tr>${prd(`${i + 1}. ${esc(c.name)}`)}${ptd(ils(c.spend))}${ptd(n0(c.installs))}${ptd(n0(c.registrations), true)}${ptd(ils(c.registrations ? c.spend / c.registrations : null), true)}</tr>`).join(""))
    : "";

  // Registrations by city — Haat's equivalent of a product mix.
  const cities = cityRows?.length
    ? head("הרשמות לפי עיר") +
      table(`<tr>${pth("עיר", true)}${pth("הוצאה")}${pth("הרשמות")}${pth(targetCpReg != null ? `עלות להרשמה (יעד ${ils(targetCpReg)})` : "עלות להרשמה")}</tr>` +
        cityRows.map((c) => `<tr>${prd(esc(c.city))}${ptd(ils(c.spend))}${ptd(n0(c.regs), true)}` +
          `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:700 13px/1.3 ${F};color:${targetCpReg != null ? (c.cpr <= targetCpReg ? GOOD_C : BAD_C) : "#1a1d26"};text-align:left" dir="ltr">${ils(c.cpr)}</td></tr>`).join("") +
        `<tr>${prd("סה״כ")}${ptd(ils(cityRows.reduce((a, c) => a + c.spend, 0)), true)}${ptd(n0(cityRows.reduce((a, c) => a + c.regs, 0)), true)}${ptd("", true)}</tr>`)
    : "";

  return shell(brand.nameHe, from, to, pills, insightsBlock(insights) + targets + funnel + activity + campaigns + cities, note);
}

// ---- Search share of voice (Colgate) ----
// Expanded to carry the whole argument: presence against the per-type target, why the misses
// happened (budget vs rank), and who else was in the auction.
export function renderImpShareEmail(
  brand: BrandConfig,
  sections: SnapSection[],
  note: string,
  from: string,
  to: string,
  typeLabel: Record<string, string> = {},
  insights: Insight[] = [],
): string {
  const spend = sections.reduce((a, s) => a + s.totals.cost, 0);
  const clicks = sections.reduce((a, s) => a + s.totals.clicks, 0);
  const impr = sections.reduce((a, s) => a + s.totals.impressions, 0);
  const wIS = sections.reduce((a, s) => a + (s.totals.impShare ?? 0) * s.totals.impressions, 0);
  const blendedIS = impr ? wIS / impr : null;

  const pills =
    pill("הוצאה", ils(spend)) + pill("חשיפות", n0(impr)) + pill("קליקים", n0(clicks)) +
    pill("נוכחות ממוצעת", pctv(blendedIS)) +
    pill("עלות לקליק", ils(clicks ? spend / clicks : null));

  // Targets per campaign type, straight from the snapshot's own goals.
  const tRows: { label: string; actual: string; target: string; ok: boolean | null; note?: string }[] = [];
  for (const sec of sections) {
    for (const row of sec.rows) {
      if (!row.target || row.impressions <= 0) continue;
      const label = `${sec.title} · ${typeLabel[row.type] ?? row.type}`;
      tRows.push({
        label,
        actual: pctv(row.impShare),
        target: `${row.target.kind === "min" ? "לפחות" : "עד"} ${pctv(row.target.value)}`,
        ok: row.pass,
        note: row.lostBudget != null && row.lostBudget > 0.2 ? `${pctv(row.lostBudget)} אבדו בגלל תקציב` : undefined,
      });
    }
  }
  const targets = tRows.length ? targetBanner(tRows) : "";

  const accountRows = sections.map((s) =>
    `<tr>${prd(esc(s.title))}${ptd(ils(s.totals.cost))}${ptd(n0(s.totals.impressions))}${ptd(n0(s.totals.clicks))}` +
    `${ptd(pctv(s.totals.impShare), true)}` +
    `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:${(s.totals.lostBudget ?? 0) > 0.2 ? BAD_C : "#1a1d26"};text-align:left" dir="ltr">${pctv(s.totals.lostBudget)}</td>` +
    `${ptd(pctv(s.totals.lostRank))}</tr>`).join("");
  const accounts =
    head("נוכחות במכרז לפי חשבון") +
    table(`<tr>${pth("חשבון", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("קליקים")}${pth("נוכחות")}${pth("אבד — תקציב")}${pth("אבד — דירוג")}</tr>${accountRows}`) +
    `<div style="margin-top:8px;color:#6b7280;font-size:11px">אובדן בגלל תקציב נפתר בהגדלת תקציב. אובדן בגלל דירוג נפתר באיכות ורלוונטיות — שתי בעיות שונות.</div>`;

  // Per campaign type, the operational view.
  const typeRows = sections.flatMap((s) => s.rows.filter((r) => r.impressions > 0).map((r) =>
    `<tr>${prd(`${esc(s.title)} · ${esc(typeLabel[r.type] ?? r.type)}`)}${ptd(ils(r.cost))}${ptd(n0(r.impressions))}` +
    `${ptd(pctv(r.impShare), true)}${ptd(r.target ? `${r.target.kind === "min" ? "≥" : "≤"} ${pctv(r.target.value)}` : "—")}` +
    `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:700 12px/1.3 ${F};color:${r.pass == null ? "#6b7280" : r.pass ? GOOD_C : BAD_C};text-align:left">${r.pass == null ? "—" : r.pass ? "✓" : "✗"}</td></tr>`)).join("");
  const types = typeRows
    ? head("לפי סוג קמפיין מול יעד") +
      table(`<tr>${pth("קמפיין", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("נוכחות")}${pth("יעד")}${pth("")}</tr>${typeRows}`)
    : "";

  // Who else showed up.
  const rivals = sections.flatMap((s) => s.competitors.map((c) => ({ ...c, acct: s.title })));
  const byDomain = new Map<string, { days: number; acct: string }>();
  for (const r of rivals) {
    const d = String((r as { domain?: string }).domain ?? "").trim();
    if (!d) continue;
    const days = Number((r as { days?: number }).days ?? 0);
    const e = byDomain.get(d);
    if (!e || days > e.days) byDomain.set(d, { days, acct: r.acct });
  }
  const top = [...byDomain].sort((a, b) => b[1].days - a[1].days).slice(0, 10);
  const competitors = top.length
    ? head(`מתחרים במכרז · ${byDomain.size} דומיינים`) +
      table(`<tr>${pth("דומיין", true)}${pth("ימים במכרז")}</tr>` +
        top.map(([d, v]) => `<tr>${prd(esc(d))}${ptd(String(v.days), true)}</tr>`).join(""))
    : "";

  return shell(brand.nameHe, from, to, pills, insightsBlock(insights) + targets + accounts + types + competitors, note);
}

// ---- moved from the send route so every sender shares one set of templates ----
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export function renderEmail(r: ClientReport, note: string, products: TopProductsResult | null, insights: Insight[] = []): string {
  const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  const row = (a: string, b: string) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26">${a}</td><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${b}</td></tr>`;
  // Per-platform as a real multi-column table (was one crammed cell). Numbers LTR, platform RTL.
  const pth = (t: string, right = false) => `<th style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 11px/1.2 ${F};color:#6b7280;text-align:${right ? "right" : "left"};white-space:nowrap"${right ? "" : ' dir="ltr"'}>${t}</th>`;
  const ptd = (t: string, b = false) => `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:${b ? 600 : 400} 13px/1.3 ${F};color:#1a1d26;text-align:left;white-space:nowrap" dir="ltr">${t}</td>`;
  const platforms =
    `<tr>${pth("פלטפורמה", true)}${pth("הוצאה")}${pth("הכנסות")}${pth("ROAS")}${pth("CVR")}${pth("AOV")}</tr>` +
    r.platforms.map((p) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:right;white-space:nowrap">${esc(p.platform)}</td>${ptd(ils(p.spend))}${ptd(ils(p.revenue), true)}${ptd(roas(p.roas))}${ptd(pct(p.cvr))}${ptd(ils(p.aov))}</tr>`).join("");
  const adName = (a: ClientReport["topAds"][number], i: number) =>
    a.previewUrl
      ? `${i + 1}. <a href="${esc(a.previewUrl)}" style="color:#4f46e5;text-decoration:none" target="_blank" rel="noopener">${esc(a.name)} ↗</a>`
      : `${i + 1}. ${esc(a.name)}`;
  const at = r.topAds.reduce((a, x) => ({ spend: a.spend + x.spend, metaRev: a.metaRev + x.revenue, storeRev: a.storeRev + (x.storeRevenue ?? 0) }), { spend: 0, metaRev: 0, storeRev: 0 });
  const adsTotal = r.topAds.length
    ? `<tr><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:right">סה״כ</td>${ptd(ils(at.spend), true)}${ptd(at.spend ? roas(at.metaRev / at.spend) : "—", true)}${ptd(at.storeRev ? ils(at.storeRev) : "—", true)}${ptd(at.spend && at.storeRev ? roas(at.storeRev / at.spend) : "—", true)}</tr>`
    : "";
  const ads =
    `<tr>${pth("מודעה", true)}${pth("הוצאה")}${pth("רואס מטא")}${pth("הכנסות חנות")}${pth("רואס חנות")}</tr>` +
    r.topAds.map((a, i) => `<tr><td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26;text-align:right">${adName(a, i)}</td>${ptd(ils(a.spend))}${ptd(roas(a.roas))}${ptd(a.storeRevenue == null ? "—" : ils(a.storeRevenue), true)}${ptd(a.storeRoas == null ? "—" : roas(a.storeRoas), true)}</tr>`).join("") +
    adsTotal;

  // Best sellers over the same range as the rest of the report.
  const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  let productsBlock = "";
  if (products && products.rows.length) {
    const topRev = products.rows.reduce((a, x) => a + x.revenue, 0);
    const topUnits = products.rows.reduce((a, x) => a + x.quantity, 0);
    const ofStore = !!(products.storeRevenue && products.storeRevenue >= topRev);
    const base = ofStore ? products.storeRevenue! : topRev;
    const shareOf = (v: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : "—");
    const shareLabel = ofStore ? "% מהמוצרים" : "% מהמובילים";
    const label = `${fmtD(products.from)}–${fmtD(products.to)}`;
    const rows = products.rows.map((x, i) =>
      `<tr><td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26;text-align:right">${i + 1}. ${esc(x.name)}</td>${ptd(x.quantity.toLocaleString("en-US"))}${ptd(ils(x.avgPrice))}${ptd(ils(x.revenue), true)}${ptd(shareOf(x.revenue))}</tr>`).join("");
    const totalRow = `<tr><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:right">סה״כ ${products.rows.length} המובילים</td><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${topUnits.toLocaleString("en-US")}</td><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${topUnits ? ils(topRev / topUnits) : "—"}</td><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${ils(topRev)}</td><td style="padding:7px 8px;border-top:2px solid #ececf3;font:700 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${shareOf(topRev)}</td></tr>`;
    const note30 = ofStore
      ? `<div style="margin-top:6px;color:#6b7280;font-size:11px">סך מכירות המוצרים בתקופה ${ils(base)}, אחרי הנחות. ההפרש מסך הכנסות החנות הוא דמי משלוח, שאינם מוצר.</div>`
      : "";
    productsBlock =
      `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px">מוצרים מובילים · ${label}</div>` +
      `<table role="presentation" width="100%" style="border-collapse:collapse">` +
      `<tr>${pth("מוצר", true)}${pth("יחידות")}${pth("מחיר ממוצע")}${pth("הכנסות")}${pth(shareLabel)}</tr>` +
      rows + totalRow + `</table>` + note30;
  }

  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">דוח ביצועים · ${esc(r.brandName)} · ${r.from} – ${r.to}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span style="padding:8px 12px;border:1px solid #d9d3f5;background:#f4f1ff;border-radius:999px;font-size:12px;color:#6b7280">הכנסות חנות <b style="color:#4f46e5">${ils(r.topLevel.storeRevenue)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הזמנות <b style="color:#1a1d26">${r.topLevel.orders.toLocaleString("en-US")}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הוצאה <b style="color:#1a1d26">${ils(r.topLevel.totalSpend)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס אתר <b style="color:#1a1d26">${roas(r.topLevel.siteRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">רואס ממומן <b style="color:#1a1d26">${roas(r.topLevel.paidRoas)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">אחוז המרה <b style="color:#1a1d26">${pct(r.topLevel.cvr)}</b></span>
        <span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">הרשמות <b style="color:#1a1d26">${r.registrations.toLocaleString("en-US")}</b></span>
      </div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      ${insightsBlock(insights)}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:6px 0">לפי פלטפורמה</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${platforms}</table>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 6px">${r.topAds.length || 5} מודעות מובילות ברואס</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${ads}</table>
      ${productsBlock}
      <div style="margin-top:16px;color:#6b7280;font-size:13px;line-height:1.6">${esc(r.summary)}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #ececf3;color:#6b7280;font-size:11px">Leaders · Powered by People</div>
  </div></body></html>`;
}


// Leads/awareness brand (Leaders / Bestie) report email — per-platform spend/leads/CPL + note.

const cplv = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);

export function renderLeadsEmail(brand: BrandConfig, m: CampBrandMetrics, note: string, from: string, to: string, insights: Insight[] = []): string {
  const t = m.total;
  const targetCpl = brand.targetCpl ?? null;
  const budget = brand.monthlyBudget ?? 0;

  const pills =
    pill("הוצאה", ils(t.spend)) + pill("לידים", n0(t.leads)) + pill("עלות לליד", ils(t.cpl)) +
    pill("קליקים", n0(t.clicks)) + pill("חשיפות", n0(t.impressions)) +
    (t.ctr != null ? pill("CTR", pctv(t.ctr)) : "");

  const tRows: { label: string; actual: string; target: string; ok: boolean | null; note?: string }[] = [];
  if (targetCpl != null) {
    tRows.push({
      label: "עלות לליד", actual: ils(t.cpl), target: `עד ${ils(targetCpl)}`,
      ok: okCost(t.cpl, targetCpl),
      note: t.cpl != null ? `${pctAttain(attain(t.cpl, targetCpl))} מהתקרה` : undefined,
    });
    if (budget > 0) {
      const implied = Math.round(budget / targetCpl);
      tRows.push({
        label: "לידים מהתקציב החודשי", actual: n0(t.leads), target: `${n0(implied)} (₪${budget.toLocaleString("en-US")} ÷ ₪${targetCpl})`,
        ok: t.leads >= implied, note: `${pctAttain((t.leads / implied) * 100)} מהיעד הנגזר`,
      });
    }
  }
  if (budget > 0) {
    tRows.push({
      label: "ניצול תקציב", actual: ils(t.spend), target: ils(budget),
      ok: null, note: `${pctAttain((t.spend / budget) * 100)} מהתקציב החודשי`,
    });
  }
  const targets = tRows.length ? targetBanner(tRows) : "";

  const rows = m.channels.filter((c) => c.channel !== "total").map((c) =>
    `<tr>${prd(esc(CH_LABEL[c.channel] ?? c.channel))}${ptd(ils(c.spend))}${ptd(n0(c.impressions))}${ptd(n0(c.clicks))}${ptd(pctv(c.ctr))}${ptd(n0(c.leads), true)}` +
    `<td style="padding:7px 8px;border-bottom:1px solid #ececf3;font:700 13px/1.3 ${F};color:${targetCpl != null && c.cpl != null ? (c.cpl <= targetCpl ? GOOD_C : BAD_C) : "#1a1d26"};text-align:left" dir="ltr">${ils(c.cpl)}</td></tr>`).join("");
  const totalRow = `<tr>${prd("סה״כ")}${ptd(ils(t.spend), true)}${ptd(n0(t.impressions), true)}${ptd(n0(t.clicks), true)}${ptd(pctv(t.ctr), true)}${ptd(n0(t.leads), true)}${ptd(ils(t.cpl), true)}</tr>`;
  const platforms =
    head("לפי פלטפורמה") +
    table(`<tr>${pth("פלטפורמה", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("קליקים")}${pth("CTR")}${pth("לידים")}${pth(targetCpl != null ? `עלות לליד (יעד ${ils(targetCpl)})` : "עלות לליד")}</tr>${rows}${totalRow}`);

  return shell(brand.nameHe, from, to, pills, insightsBlock(insights) + targets + platforms, note);
}
