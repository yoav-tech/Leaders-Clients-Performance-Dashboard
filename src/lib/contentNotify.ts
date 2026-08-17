// Email notifications for the content-approval flow. Manager marks content pending → the CEO
// (brand client) is emailed; the CEO approves / requests changes → the managers are emailed.
import { emailConfigured, sendEmail } from "./email";
import { appBaseUrl } from "./taskLink";
import { brandClients, brandManagers, mediaManagers } from "./recipients";
import type { BrandConfig } from "./brands";

const F = "-apple-system,Segoe UI,Roboto,Arial,sans-serif";
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const linkFor = (subBrandId: string) => `${appBaseUrl()}/leaders?sub=${subBrandId}&tab=calendar`;

function shell(title: string, bodyHtml: string, ctaHref: string, ctaLabel: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb"><div dir="rtl" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ececf3;border-radius:16px;overflow:hidden;font-family:${F}">
    <div style="padding:22px 24px;background:linear-gradient(135deg,#efeaff,#fff);border-bottom:1px solid #ececf3">
      <div style="font:800 20px/1 ${F};letter-spacing:.16em;color:#1a1d26">LEADERS</div>
      <div style="margin-top:6px;color:#6b7280;font-size:13px">${esc(title)}</div>
    </div>
    <div style="padding:20px 24px"><div style="font:400 14px/1.7 ${F};color:#1a1d26">${bodyHtml}</div>
      <a href="${ctaHref}" style="display:inline-block;margin-top:16px;padding:10px 20px;border-radius:10px;background:#7c3aed;color:#fff;font:700 14px/1 ${F};text-decoration:none">${ctaLabel} ←</a>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #ececf3;color:#6b7280;font:400 11px/1.5 ${F}">Leaders · Powered by People</div>
  </div></body></html>`;
}

// Manager marked the month / an item ready → tell the CEO. Returns the addresses emailed.
export async function notifyReadyForApproval(brand: BrandConfig, scope: string): Promise<string[]> {
  if (!emailConfigured()) return [];
  const to = await brandClients(brand.id);
  if (!to.length) return [];
  const title = `תוכן מוכן לאישור · ${brand.nameHe}`;
  const body = `היי, <b>${esc(scope)}</b> מוכן לאישורך במרכז השליטה. אפשר לאשר או לבקש שינויים לכל פריט תוכן.`;
  await sendEmail({ to, subject: title, html: shell(title, body, linkFor(brand.id), "פתח לאישור"), text: `${title} — ${scope}: ${linkFor(brand.id)}` });
  return to;
}

// CEO approved / requested changes → tell the managers. Returns the addresses emailed.
export async function notifyDecision(brand: BrandConfig, itemTitle: string, decision: "approved" | "changes_requested", feedback: string): Promise<string[]> {
  if (!emailConfigured()) return [];
  let to = await brandManagers(brand.id);
  if (!to.length) to = mediaManagers();
  if (!to.length) return [];
  const word = decision === "approved" ? "אושר" : "התבקש שינוי";
  const title = `${word} · ${brand.nameHe} · ${itemTitle}`;
  const body = decision === "approved"
    ? `הלקוח <b>אישר</b> את "${esc(itemTitle)}".`
    : `הלקוח <b>ביקש שינוי</b> ב"${esc(itemTitle)}".${feedback ? `<br><br><b>הערת הלקוח:</b> ${esc(feedback)}` : ""}`;
  await sendEmail({ to, subject: title, html: shell(title, body, linkFor(brand.id), "פתח במרכז"), text: `${title}\n${feedback}` });
  return to;
}
