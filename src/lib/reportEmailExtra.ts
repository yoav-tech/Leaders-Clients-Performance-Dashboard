// Monthly summary emails for the brand types that had no template: video/awareness brands
// (Style, Protein Max, Chery, Xpeng, SCJ), the app brand (Haat) and the search-share brand
// (Colgate). Same shell as the e-commerce and leads reports so every client gets one look.
import type { BrandConfig } from "./brands";
import type { CampBrandMetrics } from "./campaignMetrics";
import type { AppReport } from "./appReport";
import type { SnapSection } from "./searchSnapshot";
import { periodLabel, type ClientReport } from "./clientReport";
import type { TopProductsResult } from "./topProducts";

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

// ---- Video / awareness brands (Style, Protein Max, Chery, Xpeng, SCJ) ----
export function renderViewsEmail(brand: BrandConfig, m: CampBrandMetrics, note: string, from: string, to: string): string {
  const t = m.total;
  const pills =
    pill("הוצאה", ils(t.spend)) + pill("חשיפות", n0(t.impressions)) + pill("Reach", n0(t.reach)) +
    pill("ThruPlay", n0(t.views)) + pill("עלות ל-ThruPlay", ils2(t.cpv)) +
    (t.views3s ? pill("צפיות 3 שניות", n0(t.views3s)) : "");
  const rows = m.channels
    .filter((c) => c.channel !== "total")
    .map((c) => `<tr>${prd(esc(CH_LABEL[c.channel] ?? c.channel))}${ptd(ils(c.spend))}${ptd(n0(c.impressions))}${ptd(n0(c.reach))}${ptd(c.views3s ? n0(c.views3s) : "—")}${ptd(n0(c.views), true)}${ptd(ils2(c.cpv), true)}</tr>`)
    .join("");
  const totalRow = `<tr>${prd("סה״כ")}${ptd(ils(t.spend), true)}${ptd(n0(t.impressions), true)}${ptd(n0(t.reach), true)}${ptd(t.views3s ? n0(t.views3s) : "—", true)}${ptd(n0(t.views), true)}${ptd(ils2(t.cpv), true)}</tr>`;
  const body =
    head("לפי פלטפורמה") +
    table(`<tr>${pth("פלטפורמה", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("Reach")}${pth("3 שניות")}${pth("ThruPlay")}${pth("עלות ThruPlay")}</tr>${rows}${totalRow}`) +
    `<div style="margin-top:8px;color:#6b7280;font-size:11px">צפיות 3 שניות נמדדות במטא בלבד. ThruPlay = 15 שניות או סיום במטא, 6 שניות בטיקטוק.</div>`;
  return shell(brand.nameHe, from, to, pills, body, note);
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

  const pills =
    pill("הוצאה", ils(spend)) +
    pill("התקנות", n0(installs)) +
    pill("הרשמות", n0(regs)) +
    pill("עלות להתקנה", ils(installs ? appSpend / installs : null)) +
    pill("עלות להרשמה", ils(regs ? appSpend / regs : null)) +
    (leads ? pill("לידים · גיוס", n0(leads)) + pill("עלות לליד", ils(hrSpend / leads)) : "");

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
      table(`<tr>${pth("עיר", true)}${pth("הוצאה")}${pth("הרשמות")}${pth("עלות להרשמה")}</tr>` +
        cityRows.map((c) => `<tr>${prd(esc(c.city))}${ptd(ils(c.spend))}${ptd(n0(c.regs), true)}${ptd(ils(c.cpr), true)}</tr>`).join("") +
        `<tr>${prd("סה״כ")}${ptd(ils(cityRows.reduce((a, c) => a + c.spend, 0)), true)}${ptd(n0(cityRows.reduce((a, c) => a + c.regs, 0)), true)}${ptd("", true)}</tr>`)
    : "";

  return shell(brand.nameHe, from, to, pills, funnel + activity + campaigns + cities, note);
}

// ---- Search share of voice (Colgate) ----
export function renderImpShareEmail(brand: BrandConfig, sections: SnapSection[], note: string, from: string, to: string): string {
  const spend = sections.reduce((a, s) => a + s.totals.cost, 0);
  const clicks = sections.reduce((a, s) => a + s.totals.clicks, 0);
  const impr = sections.reduce((a, s) => a + s.totals.impressions, 0);
  const pills = pill("הוצאה", ils(spend)) + pill("חשיפות", n0(impr)) + pill("קליקים", n0(clicks));
  const rows = sections
    .map((s) => `<tr>${prd(esc(s.title))}${ptd(ils(s.totals.cost))}${ptd(n0(s.totals.impressions))}${ptd(pctv(s.totals.impShare), true)}${ptd(pctv(s.totals.lostBudget))}${ptd(pctv(s.totals.lostRank))}</tr>`)
    .join("");
  const body =
    head("נוכחות במכרז לפי חשבון") +
    table(`<tr>${pth("חשבון", true)}${pth("הוצאה")}${pth("חשיפות")}${pth("נוכחות")}${pth("אבד — תקציב")}${pth("אבד — דירוג")}</tr>${rows}`) +
    `<div style="margin-top:8px;color:#6b7280;font-size:11px">״נוכחות״ = אחוז החיפושים שבהם המודעה שלנו הוצגה. אובדן בגלל תקציב נפתר בתקציב; אובדן בגלל דירוג נפתר באיכות ורלוונטיות.</div>`;
  return shell(brand.nameHe, from, to, pills, body, note);
}


// ---- moved from the send route so every sender shares one set of templates ----
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export function renderEmail(r: ClientReport, note: string, products: TopProductsResult | null): string {
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

export function renderLeadsEmail(brand: BrandConfig, m: CampBrandMetrics, note: string, from: string, to: string): string {
  const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
  const t = m.total;
  const row = (a: string, b: string) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:400 13px/1.3 ${F};color:#1a1d26">${a}</td><td style="padding:6px 8px;border-bottom:1px solid #ececf3;font:600 13px/1.3 ${F};color:#1a1d26;text-align:left" dir="ltr">${b}</td></tr>`;
  const rows = m.channels.filter((c) => c.channel !== "total").map((c) => row(esc(CH_LABEL[c.channel] ?? c.channel), `${ils(c.spend)} · ${n0(c.clicks)} קליקים · ${n0(c.leads)} לידים · CPL ${cplv(c.cpl)}`)).join("");
  const pill = (l: string, v: string) => `<span style="padding:8px 12px;border:1px solid #ececf3;border-radius:999px;font-size:12px;color:#6b7280">${l} <b style="color:#1a1d26">${v}</b></span>`;
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 22px/1 ${F};letter-spacing:.16em">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">דוח ביצועים · ${esc(brand.nameHe)} · ${esc(periodLabel(from, to))}</div>
    </div>
    <div style="padding:18px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${pill("הוצאה", ils(t.spend))}${pill("לידים", n0(t.leads))}${pill("עלות לליד", cplv(t.cpl))}${pill("קליקים", n0(t.clicks))}</div>
      ${note ? `<div style="padding:12px 14px;border:1px solid rgba(124,58,237,.18);border-radius:12px;background:#f4f1ff;margin-bottom:14px;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(note)}</div>` : ""}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:6px 0">לפי פלטפורמה · הוצאה · קליקים · לידים · CPL</div>
      <table role="presentation" width="100%" style="border-collapse:collapse">${rows}</table>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #ececf3;color:#6b7280;font-size:11px">Leaders · Powered by People</div>
  </div></body></html>`;
}
