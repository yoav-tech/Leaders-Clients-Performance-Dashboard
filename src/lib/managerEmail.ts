// Branded weekly/monthly email for the account (client) manager — leads with Claude's narrative
// conclusions, then the period KPIs, top creatives, and promo performance. Leaders violet, RTL.
import type { ManagerReport } from "./managerReport";

const C = {
  text: "#1a1d26", muted: "#6b7280", border: "#ececf3", violet: "#7c3aed", violetSoft: "#f4f1ff",
  violetBorder: "rgba(124,58,237,.18)", good: "#15803d", bad: "#dc2626", warn: "#b45309", bg: "#f5f4fb", card: "#ffffff",
};
const FONT = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const n0 = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
const roas = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pctd = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));

function deltaBadge(cur: number | null, prev: number | null, goodUp = true): string {
  const d = pctd(cur, prev);
  if (d === null) return "";
  const good = goodUp ? d >= 0 : d <= 0;
  return `<span style="font:600 11px/1 ${FONT};color:${good ? C.good : C.bad};margin-inline-start:4px">${d >= 0 ? "▲" : "▼"}${Math.abs(d)}%</span>`;
}
function kpi(label: string, value: string, badge = ""): string {
  return `<td style="padding:6px" width="33%"><div style="border:1px solid ${C.border};border-radius:12px;padding:10px 12px;background:${C.card}">
    <div style="font:600 10px/1 ${FONT};text-transform:uppercase;letter-spacing:.03em;color:${C.muted}">${label}</div>
    <div style="margin-top:5px;font:700 17px/1 ${FONT};color:${C.text}">${value}${badge}</div>
  </div></td>`;
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
function tableRows(headers: [string, "left" | "right"][], rows: string[][], aligns: ("left" | "right")[]): string {
  if (!rows.length) return "";
  const th = headers.map(([h, a]) => `<th style="padding:6px 5px;text-align:${a};font:600 10px/1 ${FONT};text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.border};white-space:nowrap">${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:7px 5px;text-align:${aligns[i]};font:400 13px/1.3 ${FONT};color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap">${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderManagerHtml(r: ManagerReport, conclusions: string[]): string {
  const m = r.metrics;
  const p = m?.previous ?? null;
  const periodLabel = r.period === "week" ? "שבועי" : "חודשי";

  const concl = conclusions.length
    ? `<ul style="margin:2px 0;padding-inline-start:20px">${conclusions.map((b) => `<li style="margin:6px 0;font:400 14px/1.55 ${FONT};color:${C.text}">${esc(b)}</li>`).join("")}</ul>`
    : `<div style="font:400 13px/1.5 ${FONT};color:${C.muted}">אין מספיק נתונים לסיכום מילולי לתקופה זו.</div>`;

  const kpis = m
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        ${kpi("הכנסות חנות", ils(m.channels.site.revenue), deltaBadge(m.channels.site.revenue, p?.siteRevenue ?? null))}
        ${kpi("הזמנות", n0(m.channels.site.purchases), deltaBadge(m.channels.site.purchases, p?.siteOrders ?? null))}
        ${kpi("ROAS", roas(m.blendedRoas), deltaBadge(m.blendedRoas, p?.blendedRoas ?? null))}
      </tr><tr>
        ${kpi("הוצאה", ils(m.total.spend), deltaBadge(m.total.spend, p?.spend ?? null, false))}
        ${kpi("AOV", ils(m.channels.site.aov), "")}
        ${kpi("CAC", ils(m.cac), "")}
      </tr></table>`
    : "";

  const creatives = tableRows(
    [["מודעה", "left"], ["הוצאה", "right"], ["CTR", "right"]],
    r.topAds.map((a) => [`<span dir="auto">${esc(a.name.length > 46 ? a.name.slice(0, 44) + "…" : a.name)}</span>`, ils(a.spend), a.ctr == null ? "—" : `${(a.ctr * 100).toFixed(1)}%`]),
    ["left", "right", "right"],
  );
  const promos = tableRows(
    [["קוד", "left"], ["הזמנות", "right"], ["הכנסות", "right"], ["הנחה", "right"]],
    r.promos.map((pr) => [esc(pr.code), n0(pr.orders), ils(pr.revenue), ils(pr.discount)]),
    ["left", "right", "right", "right"],
  );

  const inner = `<div dir="rtl">
    <tr><td style="padding:0"><div style="padding:26px 24px 18px;background:linear-gradient(135deg,#efeaff 0%,#ffffff 72%);border-bottom:1px solid ${C.border}">
      <div style="font:800 22px/1 ${FONT};letter-spacing:.16em;color:${C.text}">LEADERS</div>
      <div style="margin-top:6px;font:600 15px/1 ${FONT};color:${C.text}">${esc(r.brandName)} · דוח ${periodLabel}</div>
      <div style="margin-top:3px;font:400 12px/1 ${FONT};color:${C.muted}">${r.from} → ${r.to}</div>
    </div></td></tr>
    ${card("מסקנות ופעולות", concl)}
    ${card("ביצועי התקופה", kpis)}
    ${card("קריאייטיבים מובילים", creatives)}
    ${card("מבצעים · קודי הנחה", promos)}
    <tr><td style="padding:16px 24px 22px;border-top:1px solid ${C.border}"><div style="font:400 11px/1.5 ${FONT};color:${C.muted}">Leaders · Powered by People</div></td></tr>
  </div>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.bg};padding:24px 0"><tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">${inner}</table>
  </td></tr></table></body></html>`;
}

export function renderManagerText(r: ManagerReport, conclusions: string[]): string {
  const lines = [`דוח ${r.period === "week" ? "שבועי" : "חודשי"} · ${r.brandName} · ${r.from} → ${r.to}`, "", "מסקנות:"];
  for (const b of conclusions) lines.push(`• ${b}`);
  return lines.join("\n");
}

export function managerSubject(r: ManagerReport): string {
  return `דוח ${r.period === "week" ? "שבועי" : "חודשי"} · ${r.brandName} · ${r.from} → ${r.to}`;
}
