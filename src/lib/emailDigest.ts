// Branded HTML daily-recap email (Leaders violet language, inline styles for email clients).
// Reuses the same DigestData as the ClickUp recap so the two never diverge.
import { getDigestData, renderDigestText, type DigestData, type DigestRow } from "./digest";
import type { Alert } from "./alerts";
import { canCreateTasks } from "./clickup";
import { signTask, appBaseUrl } from "./taskLink";

const C = {
  text: "#1a1d26",
  muted: "#6b7280",
  border: "#e8e8f0",
  violet: "#7c3aed",
  violetSoft: "#f3f0ff",
  good: "#15803d",
  bad: "#dc2626",
  warn: "#b45309",
  bg: "#f5f5fb",
  card: "#ffffff",
};

const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
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

function th(label: string, align: "left" | "right" = "right") {
  return `<th style="padding:8px 10px;text-align:${align};font:600 11px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:${C.muted};border-bottom:1px solid ${C.border}">${label}</th>`;
}
function td(html: string, align: "left" | "right" = "right", extra = "") {
  return `<td style="padding:9px 10px;text-align:${align};font:400 14px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.text};border-bottom:1px solid ${C.border};${extra}">${html}</td>`;
}

function kpiTable(rows: DigestRow[]): string {
  const dash = td("—");
  const body = rows.map((r) => `
    <tr>
      ${td(`<b>${esc(r.name)}</b>`, "left")}
      ${td(ils(r.spend))}
      ${r.conversion ? td(ils(r.revenue)) : dash}
      ${r.conversion ? td(`<span style="color:${roasColor(r.blended, r.target)};font-weight:600">${roas(r.blended)}</span>${trend(r.blended, r.blendedPrev)}`) : dash}
      ${r.conversion ? td(String(r.orders)) : dash}
      ${td(r.pacePct == null ? "—" : `${Math.round(r.pacePct)}%`)}
    </tr>`).join("");
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
    <thead><tr>${th("Brand", "left")}${th("Spend")}${th("Revenue")}${th("ROAS")}${th("Orders")}${th("Pace")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function taskButton(url: string): string {
  return `<a href="${url}" style="display:inline-block;white-space:nowrap;padding:5px 10px;border:1px solid ${C.border};border-radius:8px;background:${C.violetSoft};color:${C.violet};font:600 11px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-decoration:none">+ ClickUp</a>`;
}

// taskLinks: alert.key → signed task-creation URL (present only when ClickUp tasks are configured).
function alertsBlock(alerts: Alert[], taskLinks: Record<string, string>): string {
  if (!alerts.length) {
    return `<div style="padding:12px 14px;border-radius:10px;background:#f0fdf4;color:${C.good};font:600 14px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif">✓ אין התראות פתוחות</div>`;
  }
  const order: string[] = [];
  const byBrand = new Map<string, Alert[]>();
  for (const a of alerts) {
    if (!byBrand.has(a.brandName)) { byBrand.set(a.brandName, []); order.push(a.brandName); }
    byBrand.get(a.brandName)!.push(a);
  }
  const rank: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };
  const blocks = order.map((brand) => {
    const list = byBrand.get(brand)!.sort((a, b) => rank[a.severity] - rank[b.severity]);
    const worst = sevColor(list[0].severity);
    const items = list.map((a) => {
      const btn = taskLinks[a.key] ? taskButton(taskLinks[a.key]) : "";
      return `<tr>
        <td style="padding:4px 0;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.text}">• ${esc(a.detail)}</td>
        <td align="left" valign="top" style="padding:4px 0 4px 8px;white-space:nowrap">${btn}</td>
      </tr>`;
    }).join("");
    return `
    <div style="margin:8px 0;padding:12px 14px;border:1px solid ${C.border};border-inline-start:3px solid ${worst};border-radius:10px;background:${C.card}">
      <div style="font:700 14px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.text};margin-bottom:4px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${worst};margin-inline-end:6px"></span>${esc(brand)}
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>
    </div>`;
  }).join("");
  return blocks;
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.bg};padding:24px 0">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">
        ${inner}
      </table>
    </td></tr>
  </table></body></html>`;
}

export function renderDigestHtml(data: DigestData, taskLinks: Record<string, string> = {}): string {
  const header = `
  <tr><td style="padding:22px 24px 18px;border-bottom:1px solid ${C.border};background:linear-gradient(135deg,${C.violetSoft},#ffffff)">
    <div style="font:800 20px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.14em;color:${C.text}">LEADERS</div>
    <div style="margin-top:4px;font:400 13px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.muted}">Clients Performance · דוח יומי · ${data.day}</div>
  </td></tr>`;

  const kpis = `
  <tr><td style="padding:18px 20px 4px">
    <div style="font:600 11px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:${C.muted};margin:0 4px 8px">סקירת מותגים</div>
    ${kpiTable(data.rows)}
    <div style="margin:8px 4px 0;font:400 11px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.muted}">Blended = הכנסות חנות ÷ הוצאת מדיה · ▲▼ מול היום הקודם · Pace = MTD מול תקציב</div>
  </td></tr>`;

  const attention = `
  <tr><td style="padding:14px 20px 20px">
    <div style="font:600 11px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:${C.muted};margin:6px 4px 6px">צריך תשומת לב</div>
    ${alertsBlock(data.alerts, taskLinks)}
  </td></tr>`;

  const footer = `
  <tr><td style="padding:14px 24px 20px;border-top:1px solid ${C.border}">
    <div style="font:400 11px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${C.muted}">Leaders · Powered by People · מייל אוטומטי מלוח הבקרה</div>
  </td></tr>`;

  return shell(`<div dir="rtl">${header}${kpis}${attention}${footer}</div>`);
}

// subject + html + plaintext from already-computed data. Signs a one-click "+ ClickUp" link per
// alert when ClickUp task-creation is configured.
export async function buildDigestEmailFrom(data: DigestData): Promise<{ subject: string; html: string; text: string }> {
  const taskLinks: Record<string, string> = {};
  if (canCreateTasks()) {
    const base = appBaseUrl();
    for (const a of data.alerts) {
      const token = await signTask(`[${a.brandName}] ${a.detail}`);
      taskLinks[a.key] = `${base}/api/clickup/task?t=${token}`;
    }
  }
  return {
    subject: `דוח יומי לקוחות לידרס · ${data.day}`,
    html: renderDigestHtml(data, taskLinks),
    text: renderDigestText(data),
  };
}

// Convenience wrapper that fetches live data first.
export async function buildDigestEmail(alerts?: Alert[]): Promise<{ subject: string; html: string; text: string }> {
  return buildDigestEmailFrom(await getDigestData(alerts));
}
