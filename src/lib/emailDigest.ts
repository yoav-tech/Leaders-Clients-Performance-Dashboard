// Branded HTML daily-recap email — split into e-commerce / views / leads / impression-share
// tables (Leaders violet, RTL, inline styles for email clients). Reuses GroupedDigest so the
// ClickUp recap and the email never diverge.
import { getGroupedDigest, renderGroupedText, type GroupedDigest, type EcomRow } from "./digestGroups";
import type { Alert } from "./alerts";
import { canCreateTasks } from "./clickup";
import { signTask, appBaseUrl } from "./taskLink";
import { BRANDS, reportGroupOf } from "./brands";

// When set, the digest carries a client-report reminder for the media manager: on Sunday the weekly
// summary, on the 1st of the month the monthly one. The manager fills conclusions + sends per brand.
export type ReportReminder = "week" | "month" | null;

const C = {
  text: "#1a1d26", muted: "#6b7280", border: "#ececf3", violet: "#7c3aed", violetSoft: "#f4f1ff",
  violetBorder: "rgba(124,58,237,.18)", good: "#15803d", bad: "#dc2626", warn: "#b45309",
  bg: "#f5f4fb", card: "#ffffff",
};

const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const pctv = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const cpvv = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(2)}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function roasColor(v: number | null, target: number): string {
  if (v == null) return C.muted;
  if (target <= 0) return C.text;
  return v >= target ? C.good : v >= target * 0.7 ? C.warn : C.bad;
}
function trend(cur: number | null, prev: number | null): string {
  if (cur == null || prev == null || prev === 0) return "";
  const d = Math.round(((cur - prev) / prev) * 100);
  return `<span style="color:${d >= 0 ? C.good : C.bad};font-size:11px;font-weight:600"> ${d >= 0 ? "▲" : "▼"}${Math.abs(d)}%</span>`;
}
const sevColor = (s: Alert["severity"]) => (s === "critical" ? C.bad : s === "warning" ? C.warn : C.violet);

const FONT = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
function th(label: string, align: "left" | "right" = "right") {
  return `<th style="padding:7px 5px;text-align:${align};font:600 10px/1 ${FONT};text-transform:uppercase;letter-spacing:.02em;color:${C.muted};border-bottom:1px solid ${C.border};white-space:nowrap">${label}</th>`;
}
function td(html: string, align: "left" | "right" = "right") {
  return `<td style="padding:8px 5px;text-align:${align};font:400 13px/1.3 ${FONT};color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap">${html}</td>`;
}
// Generic table: headers[], and rows where each cell is [html, align].
function table(headers: [string, "left" | "right"][], rows: [string, "left" | "right"][][]): string {
  if (!rows.length) return "";
  const head = headers.map(([h, a]) => th(h, a)).join("");
  const body = rows.map((r) => `<tr>${r.map(([h, a]) => td(h, a)).join("")}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
// A group as a panel card — violet accent bar + title + count, no emoji (platform language).
function card(title: string, count: number, tableHtml: string): string {
  if (!tableHtml) return "";
  return `<tr><td style="padding:8px 18px">
    <div style="border:1px solid ${C.violetBorder};border-radius:14px;overflow:hidden;background:${C.card};box-shadow:0 1px 2px rgba(16,18,26,.04),0 10px 30px rgba(124,58,237,.05)">
      <div style="padding:11px 14px;background:${C.violetSoft};border-bottom:1px solid ${C.border}">
        <span style="display:inline-block;width:4px;height:13px;background:${C.violet};border-radius:2px;vertical-align:-2px;margin-inline-end:8px"></span>
        <span style="font:700 13px/1 ${FONT};color:${C.text}">${title}</span>
        <span style="font:500 11px/1 ${FONT};color:${C.muted};margin-inline-start:6px">${count}</span>
      </div>
      <div style="padding:4px 12px 8px">${tableHtml}</div>
    </div>
  </td></tr>`;
}

function pill(label: string, value: string, color = C.text): string {
  return `<span style="display:inline-block;margin-inline-end:8px;padding:6px 12px;border:1px solid ${C.border};border-radius:999px;background:#fff;font:400 12px/1 ${FONT};color:${C.muted}">${label} <b style="color:${color}">${value}</b></span>`;
}

function ecomTable(rows: EcomRow[]): string {
  return table(
    [["Brand", "left"], ["Spend", "right"], ["Revenue", "right"], ["ROAS", "right"], ["Orders", "right"], ["Pace", "right"]],
    rows.map((r) => [
      [`<b>${esc(r.name)}</b>`, "left"],
      [ils(r.spend), "right"],
      [ils(r.revenue), "right"],
      [`<span style="color:${roasColor(r.blended, r.target)};font-weight:600">${roas(r.blended)}</span>${trend(r.blended, r.blendedPrev)}`, "right"],
      [String(r.orders), "right"],
      [r.pacePct == null ? "—" : `${Math.round(r.pacePct)}%`, "right"],
    ]),
  );
}

function taskButton(url: string): string {
  return `<a href="${url}" style="display:inline-block;white-space:nowrap;padding:5px 10px;border:1px solid ${C.border};border-radius:8px;background:${C.violetSoft};color:${C.violet};font:600 11px/1 ${FONT};text-decoration:none">+ ClickUp</a>`;
}
function alertsBlock(alerts: Alert[], taskLinks: Record<string, string>): string {
  if (!alerts.length) return `<div style="padding:12px 14px;border-radius:10px;background:#f0fdf4;color:${C.good};font:600 14px/1 ${FONT}">✓ אין התראות פתוחות</div>`;
  const order: string[] = [];
  const byBrand = new Map<string, Alert[]>();
  for (const a of alerts) { if (!byBrand.has(a.brandName)) { byBrand.set(a.brandName, []); order.push(a.brandName); } byBrand.get(a.brandName)!.push(a); }
  const rank: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return order.map((brand) => {
    const list = byBrand.get(brand)!.sort((a, b) => rank[a.severity] - rank[b.severity]);
    const worst = sevColor(list[0].severity);
    const items = list.map((a) => `<tr>
      <td style="padding:4px 0;font:400 13px/1.5 ${FONT};color:${C.text}">• ${esc(a.detail)}</td>
      <td align="left" valign="top" style="padding:4px 0 4px 8px;white-space:nowrap">${taskLinks[a.key] ? taskButton(taskLinks[a.key]) : ""}</td>
    </tr>`).join("");
    return `<div style="margin:8px 0;padding:12px 14px;border:1px solid ${C.border};border-inline-start:3px solid ${worst};border-radius:10px;background:${C.card}">
      <div style="font:700 14px/1 ${FONT};color:${C.text};margin-bottom:4px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${worst};margin-inline-end:6px"></span>${esc(brand)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>
    </div>`;
  }).join("");
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.bg};padding:24px 0"><tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">${inner}</table>
  </td></tr></table></body></html>`;
}

// Client-report reminder callout — lists each e-commerce brand with a button that opens its
// dashboard, where the manager fills conclusions and hits "שלח סיכום ללקוח".
function reportReminderBlock(kind: "week" | "month"): string {
  const base = appBaseUrl();
  const brands = BRANDS.filter((b) => reportGroupOf(b) === "ecommerce");
  const title = kind === "week" ? "סיכום שבועי ללקוחות" : "סיכום חודשי ללקוחות";
  const sub = kind === "week"
    ? "הגיע הזמן להוציא דוח שבועי ללקוחות האיקומרס — מלאו את המסקנות ושלחו. הדוח לא נשלח אוטומטית."
    : "תחילת חודש — הוציאו את סיכום החודש הקודם ללקוחות האיקומרס: מלאו מסקנות ושלחו. הדוח לא נשלח אוטומטית.";
  const buttons = brands.map((b) =>
    `<a href="${appBaseUrl()}/${b.id}" style="display:inline-block;margin:4px 4px 0 0;padding:8px 14px;border-radius:8px;background:${C.violet};color:#fff;font:600 13px/1 ${FONT};text-decoration:none">${esc(b.name)} — מלא ושלח ←</a>`,
  ).join("");
  return `<tr><td style="padding:16px 18px 4px">
    <div style="padding:16px 18px;border:1px solid ${C.violetBorder};border-radius:14px;background:${C.violetSoft}">
      <div style="font:800 14px/1 ${FONT};color:${C.violet}">⏰ ${title}</div>
      <div style="margin-top:6px;font:400 13px/1.5 ${FONT};color:${C.text}">${sub}</div>
      <div style="margin-top:10px">${buttons}</div>
    </div>
  </td></tr>`;
}

export function renderGroupedHtml(d: GroupedDigest, taskLinks: Record<string, string> = {}, reminder: ReportReminder = null): string {
  const clients = d.ecom.length + d.views.length + d.leads.length + d.app.length + d.impshare.length;
  const totalSpend = [...d.ecom, ...d.views, ...d.leads, ...d.app, ...d.impshare].reduce((s, r) => s + (r.spend || 0), 0);
  const critical = d.alerts.filter((a) => a.severity === "critical").length;
  const alertColor = critical ? C.bad : d.alerts.length ? C.warn : C.good;
  const dateLine = d.period === "week" ? `דוח ביצועים שבועי · ${d.from} – ${d.to}`
    : d.from !== d.to ? `דוח ביצועים · סוף שבוע · ${d.from} – ${d.to}`
    : `דוח ביצועים יומי · ${d.to}`;

  const header = `<tr><td style="padding:0">
    <div style="padding:26px 24px 20px;background:linear-gradient(135deg,#efeaff 0%,#ffffff 72%);border-bottom:1px solid ${C.border}">
      <div style="font:800 22px/1 ${FONT};letter-spacing:.16em;color:${C.text}">LEADERS</div>
      <div style="margin-top:6px;font:400 13px/1 ${FONT};color:${C.muted}">${dateLine}</div>
      <div style="margin-top:16px">
        ${pill("הוצאה כוללת", ils(totalSpend), C.text)}
        ${pill("לקוחות", String(clients), C.text)}
        ${pill("התראות", String(d.alerts.length), alertColor)}
      </div>
    </div>
  </td></tr>`;

  const ecom = card("איקומרס", d.ecom.length, ecomTable(d.ecom));
  const views = card("צפיות", d.views.length, table(
    [["Brand", "left"], ["Spend", "right"], ["Impr", "right"], ["Views", "right"], ["CPV", "right"]],
    d.views.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [ils(r.spend), "right"], [n0(r.impressions), "right"], [n0(r.views), "right"], [cpvv(r.cpv), "right"]]),
  ));
  const leads = card("לידים", d.leads.length, table(
    [["Brand", "left"], ["Spend", "right"], ["Leads", "right"], ["CPL", "right"]],
    d.leads.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [ils(r.spend), "right"], [n0(r.leads), "right"], [ils(r.cpl), "right"]]),
  ));
  const app = card("אפליקציה", d.app.length, table(
    [["Brand", "left"], ["Spend", "right"], ["Installs", "right"], ["CPI", "right"], ["Leads (HR)", "right"], ["CPL", "right"]],
    d.app.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [ils(r.spend), "right"], [n0(r.installs), "right"], [ils(r.cpi), "right"], [n0(r.leads), "right"], [ils(r.cpl), "right"]]),
  ));
  const impshare = card("Impression Share · לפי סוג קמפיין", d.impshare.length, table(
    [["Account · Type", "left"], ["Imp Share", "right"], ["Spend", "right"], ["Clicks", "right"]],
    d.impshare.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [pctv(r.impShare), "right"], [ils(r.spend), "right"], [n0(r.clicks), "right"]]),
  ));

  const attention = `<tr><td style="padding:14px 18px 20px">
    <div style="font:700 13px/1 ${FONT};color:${C.text};margin:6px 6px 8px"><span style="display:inline-block;width:4px;height:13px;background:${alertColor};border-radius:2px;vertical-align:-2px;margin-inline-end:8px"></span>צריך תשומת לב</div>
    ${alertsBlock(d.alerts, taskLinks)}
  </td></tr>`;
  const footer = `<tr><td style="padding:16px 24px 22px;border-top:1px solid ${C.border}">
    <div style="font:400 11px/1.5 ${FONT};color:${C.muted}">Leaders · Powered by People</div></td></tr>`;

  const reminderBlock = reminder ? reportReminderBlock(reminder) : "";
  return shell(`<div dir="rtl">${header}${reminderBlock}${ecom}${views}${leads}${app}${impshare}${attention}${footer}</div>`);
}

export async function buildGroupedEmailFrom(d: GroupedDigest, reminder: ReportReminder = null): Promise<{ subject: string; html: string; text: string }> {
  const taskLinks: Record<string, string> = {};
  if (canCreateTasks()) {
    const base = appBaseUrl();
    for (const a of d.alerts) taskLinks[a.key] = `${base}/api/clickup/task?t=${await signTask(`[${a.brandName}] ${a.detail}`)}`;
  }
  const subject = d.period === "week" ? `דוח שבועי לקוחות לידרס · ${d.from} – ${d.to}`
    : d.from !== d.to ? `דוח סוף שבוע לקוחות לידרס · ${d.from} – ${d.to}`
    : `דוח יומי לקוחות לידרס · ${d.to}`;
  return { subject, html: renderGroupedHtml(d, taskLinks, reminder), text: renderGroupedText(d, reminder) };
}

export async function buildDigestEmail(alerts?: Alert[]): Promise<{ subject: string; html: string; text: string }> {
  return buildGroupedEmailFrom(await getGroupedDigest(alerts));
}

// A focused reminder email (no digest data) — used by the monthly cron so it fires reliably on the
// 1st regardless of weekday. Same reminder callout the digest carries on Sundays.
export function buildReminderEmail(kind: "week" | "month"): { subject: string; html: string; text: string } {
  const subject = kind === "week" ? "תזכורת: סיכום שבועי ללקוחות — מלא ושלח" : "תזכורת: סיכום חודשי ללקוחות — מלא ושלח";
  const header = `<tr><td style="padding:26px 24px 8px;background:linear-gradient(135deg,#efeaff 0%,#ffffff 72%);border-bottom:1px solid ${C.border}">
    <div style="font:800 22px/1 ${FONT};letter-spacing:.16em;color:${C.text}">LEADERS</div>
    <div style="margin-top:6px;font:400 13px/1 ${FONT};color:${C.muted}">${kind === "week" ? "תזכורת שבועית" : "תזכורת חודשית"}</div>
  </td></tr>`;
  const footer = `<tr><td style="padding:16px 24px 22px;border-top:1px solid ${C.border}"><div style="font:400 11px/1.5 ${FONT};color:${C.muted}">Leaders · Powered by People</div></td></tr>`;
  const html = shell(`<div dir="rtl">${header}${reportReminderBlock(kind)}${footer}</div>`);
  const ecomNames = BRANDS.filter((b) => reportGroupOf(b) === "ecommerce").map((b) => b.name).join(", ");
  const text = `⏰ תזכורת: ${kind === "week" ? "סיכום שבועי" : "סיכום חודשי"} ללקוחות — מלאו מסקנות ושלחו בדשבורד: ${ecomNames}.`;
  return { subject, html, text };
}
