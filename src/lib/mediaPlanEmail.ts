// Emails for the monthly media plan. Two audiences, one visual language (Leaders violet, RTL):
//   • review  — to the media managers on the 24th: every brand's draft + a link to approve.
//   • plan    — to the client's account manager, only after a manager approved the draft.
import type { MediaPlanDraft } from "./mediaPlanBuilder";
import type { StoredPlan } from "./mediaPlanStore";

const C = {
  text: "#1a1d26", muted: "#6b7280", border: "#ececf3", violet: "#7c3aed", violetSoft: "#f4f1ff",
  violetBorder: "rgba(124,58,237,.18)", good: "#15803d", bad: "#dc2626", bg: "#f5f4fb", card: "#ffffff",
};
const FONT = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MONTH_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export function monthLabel(month: string): string {
  return `${MONTH_HE[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

// The forecast column a client profile is actually judged on.
function forecastCell(p: MediaPlanDraft): (l: MediaPlanDraft["lines"][number]) => string {
  switch (p.profile) {
    case "ecommerce": return (l) => (l.forecast.revenue == null ? "—" : `${ils(l.forecast.revenue)}${l.forecast.roas ? ` · ROAS ${l.forecast.roas.toFixed(1)}` : ""}`);
    case "views": return (l) => (l.forecast.views == null ? n0(l.forecast.impressions) : `${n0(l.forecast.views)} צפיות`);
    case "leads": return (l) => (l.forecast.leads == null ? "—" : `${n0(l.forecast.leads)} לידים`);
    case "app": return (l) => (l.forecast.installs == null ? "—" : `${n0(l.forecast.installs)} התקנות`);
    default: return (l) => `${n0(l.forecast.impressions)} חשיפות`;
  }
}
function forecastHeader(p: MediaPlanDraft): string {
  return p.profile === "ecommerce" ? "הכנסות צפויות" : p.profile === "views" ? "צפיות צפויות" : p.profile === "leads" ? "לידים צפויים" : p.profile === "app" ? "התקנות צפויות" : "חשיפות צפויות";
}

function card(title: string, inner: string): string {
  if (!inner) return "";
  return `<tr><td style="padding:8px 18px"><div style="border:1px solid ${C.violetBorder};border-radius:14px;overflow:hidden;background:${C.card};box-shadow:0 1px 2px rgba(16,18,26,.04),0 10px 30px rgba(124,58,237,.05)">
    <div style="padding:11px 14px;background:${C.violetSoft};border-bottom:1px solid ${C.border}">
      <span style="display:inline-block;width:4px;height:13px;background:${C.violet};border-radius:2px;vertical-align:-2px;margin-inline-end:8px"></span>
      <span style="font:700 13px/1 ${FONT};color:${C.text}">${title}</span>
    </div>
    <div style="padding:10px 12px">${inner}</div>
  </div></td></tr>`;
}
function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return "";
  const th = headers.map((h) => `<th style="padding:6px 5px;text-align:right;font:600 10px/1 ${FONT};text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.border};white-space:nowrap">${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td style="padding:7px 5px;text-align:right;font:400 13px/1.3 ${FONT};color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap">${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
function kpiCell(label: string, value: string): string {
  return `<td style="padding:6px" width="33%"><div style="border:1px solid ${C.border};border-radius:12px;padding:10px 12px;background:${C.card}">
    <div style="font:600 10px/1 ${FONT};text-transform:uppercase;letter-spacing:.03em;color:${C.muted}">${label}</div>
    <div style="margin-top:5px;font:700 17px/1 ${FONT};color:${C.text}">${value}</div>
  </div></td>`;
}
function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.bg};padding:24px 0"><tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="680" style="max-width:680px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">${inner}</table>
  </td></tr></table></body></html>`;
}
function header(title: string, sub: string): string {
  return `<tr><td style="padding:0"><div style="padding:26px 24px 18px;background:linear-gradient(135deg,#efeaff 0%,#ffffff 72%);border-bottom:1px solid ${C.border}">
    <div style="font:800 22px/1 ${FONT};letter-spacing:.16em;color:${C.text}">LEADERS</div>
    <div style="margin-top:6px;font:600 15px/1 ${FONT};color:${C.text}">${esc(title)}</div>
    <div style="margin-top:3px;font:400 12px/1 ${FONT};color:${C.muted}">${esc(sub)}</div>
  </div></td></tr>`;
}
function footer(): string {
  return `<tr><td style="padding:16px 24px 22px;border-top:1px solid ${C.border}"><div style="font:400 11px/1.5 ${FONT};color:${C.muted}">Leaders · Powered by People</div></td></tr>`;
}

// The plan table + totals, shared by both emails.
function planTable(p: MediaPlanDraft): string {
  const cell = forecastCell(p);
  const rows = p.lines.map((l) => [
    `<b>${esc(l.channelLabel)}</b>`,
    esc(l.stageLabel),
    ils(l.budget),
    `${l.sharePct}%`,
    l.deltaPct == null ? "—" : `<span style="color:${l.deltaPct >= 0 ? C.good : C.bad}">${l.deltaPct >= 0 ? "+" : ""}${l.deltaPct}%</span>`,
    cell(l),
  ]);
  rows.push([
    "<b>סה״כ</b>", "",
    `<b>${ils(p.totalBudget)}</b>`, "100%", "",
    p.profile === "ecommerce"
      ? `<b>${ils(p.lines.reduce((s, l) => s + (l.forecast.revenue ?? 0), 0))}</b>`
      : "",
  ]);
  return table(["ערוץ", "שלב בפאנל", "תקציב", "חלק", "מול חודש קודם", forecastHeader(p)], rows);
}

function rationaleList(bullets: string[]): string {
  if (!bullets.length) return "";
  return `<ul style="margin:2px 0;padding-inline-start:20px">${bullets.map((b) => `<li style="margin:6px 0;font:400 14px/1.55 ${FONT};color:${C.text}">${esc(b)}</li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- client-facing plan email

export function renderPlanHtml(p: MediaPlanDraft): string {
  const budgets = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    ${kpiCell("תקציב החודש", ils(p.totalBudget))}
    ${kpiCell("הוצאה בחודש הקודם", ils(p.baselineBudget))}
    ${kpiCell(p.budgetSource === "fixed" ? "תקציב קבוע" : "תקציב מוצע", p.budgetSource === "fixed" ? "מוסכם מול הלקוח" : `המלצה: ${ils(p.recommendedBudget)}`)}
  </tr></table>`;

  const inner = `<div dir="rtl">
    ${header(`${p.brandNameHe || p.brandName} · פריסת מדיה ${monthLabel(p.month)}`, `${p.monthStart} → ${p.monthEnd}`)}
    ${card("רציונל", rationaleList(p.rationale))}
    ${card("תקציב", budgets)}
    ${card("פריסה לפי ערוץ ושלב בפאנל", planTable(p))}
    ${footer()}
  </div>`;
  return shell(inner);
}

export function renderPlanText(p: MediaPlanDraft): string {
  const lines = [
    `פריסת מדיה · ${p.brandName} · ${monthLabel(p.month)} (${p.monthStart} → ${p.monthEnd})`,
    `תקציב: ₪${Math.round(p.totalBudget).toLocaleString("en-US")} (${p.budgetSource === "fixed" ? "קבוע" : "מוצע"}) · חודש קודם: ₪${Math.round(p.baselineBudget).toLocaleString("en-US")}`,
    "",
    "רציונל:",
    ...p.rationale.map((b) => `• ${b}`),
    "",
    "פריסה:",
    ...p.lines.map((l) => `• ${l.channelLabel} · ${l.stageLabel}: ₪${Math.round(l.budget).toLocaleString("en-US")} (${l.sharePct}%)`),
  ];
  return lines.join("\n");
}

export function planSubject(p: MediaPlanDraft): string {
  return `פריסת מדיה · ${p.brandName} · ${monthLabel(p.month)}`;
}

// ---------------------------------------------------------------- internal review email

export function renderReviewHtml(plans: StoredPlan[], month: string, reviewUrl: string): string {
  const summary = table(
    ["לקוח", "תקציב", "מקור", "חודש קודם", "המלצה", "סטטוס"],
    plans.map((p) => [
      `<b>${esc(p.brandName)}</b>`,
      ils(p.totalBudget),
      p.budgetSource === "fixed" ? "קבוע" : "מוצע",
      ils(p.baselineBudget),
      p.recommendedBudget === p.totalBudget
        ? "—"
        : `<span style="color:${p.recommendedBudget > p.totalBudget ? C.good : C.bad}">${ils(p.recommendedBudget)}</span>`,
      p.status === "draft" ? "טיוטה · ממתין לאישור" : p.status === "approved" ? "מאושר" : "נשלח",
    ]),
  );

  const perBrand = plans
    .map((p) => card(`${p.brandName} · ${ils(p.totalBudget)}`, `${rationaleList(p.rationale.slice(0, 3))}${planTable(p)}`))
    .join("");

  const cta = `<div style="text-align:center;padding:6px 0 2px">
    <a href="${esc(reviewUrl)}" style="display:inline-block;background:${C.violet};color:#fff;text-decoration:none;font:600 14px/1 ${FONT};padding:12px 22px;border-radius:10px">פתח לאישור בדשבורד</a>
    <div style="margin-top:8px;font:400 11px/1.5 ${FONT};color:${C.muted}">אף פריסה לא נשלחת ללקוח עד אישור מנהל.</div>
  </div>`;

  const inner = `<div dir="rtl">
    ${header(`פריסות מדיה · ${monthLabel(month)}`, `${plans.length} לקוחות · טיוטות לאישור`)}
    ${card("סקירה", summary)}
    ${card("", cta)}
    ${perBrand}
    ${footer()}
  </div>`;
  return shell(inner);
}

export function renderReviewText(plans: StoredPlan[], month: string, reviewUrl: string): string {
  return [
    `פריסות מדיה · ${monthLabel(month)} · ${plans.length} לקוחות`,
    "",
    ...plans.map((p) => `• ${p.brandName}: ₪${Math.round(p.totalBudget).toLocaleString("en-US")} (${p.budgetSource === "fixed" ? "קבוע" : "מוצע"}) · ${p.status}`),
    "",
    `לאישור: ${reviewUrl}`,
  ].join("\n");
}

export function reviewSubject(month: string, count: number): string {
  return `פריסות מדיה ${monthLabel(month)} · ${count} לקוחות ממתינים לאישור`;
}
