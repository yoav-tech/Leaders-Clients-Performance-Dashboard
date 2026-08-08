// Branded HTML daily-recap email — split into e-commerce / views / leads / impression-share
// tables (Leaders violet, RTL, inline styles for email clients). Reuses GroupedDigest so the
// ClickUp recap and the email never diverge.
import { getGroupedDigest, renderGroupedText, type GroupedDigest, type EcomRow } from "./digestGroups";
import type { Alert } from "./alerts";
import { canCreateTasks } from "./clickup";
import { signTask, appBaseUrl } from "./taskLink";

const C = {
  text: "#1a1d26", muted: "#6b7280", border: "#e8e8f0", violet: "#7c3aed", violetSoft: "#f3f0ff",
  good: "#15803d", bad: "#dc2626", warn: "#b45309", bg: "#f5f5fb", card: "#ffffff",
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
function section(icon: string, title: string, tableHtml: string): string {
  if (!tableHtml) return "";
  return `<tr><td style="padding:14px 20px 2px">
    <div style="font:600 12px/1 ${FONT};color:${C.text};margin:0 4px 8px">${icon} ${title}</div>
    ${tableHtml}
  </td></tr>`;
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

export function renderGroupedHtml(d: GroupedDigest, taskLinks: Record<string, string> = {}): string {
  const header = `<tr><td style="padding:22px 24px 16px;border-bottom:1px solid ${C.border};background:linear-gradient(135deg,${C.violetSoft},#ffffff)">
    <div style="font:800 20px/1 ${FONT};letter-spacing:.14em;color:${C.text}">LEADERS</div>
    <div style="margin-top:4px;font:400 13px/1 ${FONT};color:${C.muted}">דוח יומי לקוחות · ${d.day}</div>
  </td></tr>`;

  const ecom = section("🛒", "איקומרס", ecomTable(d.ecom));
  const views = section("👁️", "צפיות", table(
    [["Brand", "left"], ["Spend", "right"], ["Impr", "right"], ["Views", "right"], ["CPV", "right"]],
    d.views.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [ils(r.spend), "right"], [n0(r.impressions), "right"], [n0(r.views), "right"], [cpvv(r.cpv), "right"]]),
  ));
  const leads = section("📇", "לידים", table(
    [["Brand", "left"], ["Spend", "right"], ["Leads", "right"], ["CPL", "right"]],
    d.leads.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [ils(r.spend), "right"], [n0(r.leads), "right"], [ils(r.cpl), "right"]]),
  ));
  const impshare = section("📊", "Impression Share", table(
    [["Account", "left"], ["Imp Share", "right"], ["Spend", "right"], ["Clicks", "right"]],
    d.impshare.map((r) => [[`<b>${esc(r.name)}</b>`, "left"], [pctv(r.impShare), "right"], [ils(r.spend), "right"], [n0(r.clicks), "right"]]),
  ));

  const attention = `<tr><td style="padding:16px 20px 20px">
    <div style="font:600 12px/1 ${FONT};color:${C.text};margin:6px 4px 8px">⚠️ צריך תשומת לב</div>
    ${alertsBlock(d.alerts, taskLinks)}
  </td></tr>`;
  const footer = `<tr><td style="padding:14px 24px 20px;border-top:1px solid ${C.border}">
    <div style="font:400 11px/1.5 ${FONT};color:${C.muted}">Leaders · Powered by People</div></td></tr>`;

  return shell(`<div dir="rtl">${header}${ecom}${views}${leads}${impshare}${attention}${footer}</div>`);
}

export async function buildGroupedEmailFrom(d: GroupedDigest): Promise<{ subject: string; html: string; text: string }> {
  const taskLinks: Record<string, string> = {};
  if (canCreateTasks()) {
    const base = appBaseUrl();
    for (const a of d.alerts) taskLinks[a.key] = `${base}/api/clickup/task?t=${await signTask(`[${a.brandName}] ${a.detail}`)}`;
  }
  return { subject: `דוח יומי לקוחות לידרס · ${d.day}`, html: renderGroupedHtml(d, taskLinks), text: renderGroupedText(d) };
}

export async function buildDigestEmail(alerts?: Alert[]): Promise<{ subject: string; html: string; text: string }> {
  return buildGroupedEmailFrom(await getGroupedDigest(alerts));
}
