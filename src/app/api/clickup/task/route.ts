import { verifyTask } from "@/lib/taskLink";
import { createTask, canCreateTasks } from "@/lib/clickup";
import { sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(body: string): Response {
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClickUp · Leaders</title></head>
  <body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f5fb;color:#1a1d26">
    <div style="max-width:480px;margin:56px auto;padding:24px;background:#fff;border:1px solid #e8e8f0;border-radius:16px;box-shadow:0 20px 60px rgba(124,58,237,.08)">
      <div style="font-weight:800;letter-spacing:.14em;font-size:15px;margin-bottom:16px">LEADERS</div>
      ${body}
    </div>
  </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// GET ?t=<signed> → confirmation page only (no side effect → safe from email link prefetch).
export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  const name = await verifyTask(t);
  if (!name) return page(`<h2 style="margin-top:0">הקישור לא תקין או שפג תוקפו</h2>`);
  if (!canCreateTasks()) return page(`<h2 style="margin-top:0">יצירת משימות ב-ClickUp לא מוגדרת</h2><p style="color:#6b7280">חסר <code>CLICKUP_TASK_LIST_ID</code>.</p>`);
  return page(`
    <div style="font:600 11px/1 -apple-system;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:8px">משימה חדשה ל-ClickUp</div>
    <div style="font-size:15px;line-height:1.5;margin-bottom:18px">${esc(name)}</div>
    <form method="post">
      <input type="hidden" name="t" value="${esc(t)}"/>
      <button type="submit" style="width:100%;padding:12px;border:none;border-radius:10px;background:#7c3aed;color:#fff;font-weight:600;font-size:15px;cursor:pointer">צור משימה ב-ClickUp</button>
    </form>`);
}

// POST { t } → create the task (same-origin, from the confirmation page above).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return page(`<h2 style="margin-top:0">בקשה לא חוקית</h2>`);
  const form = await request.formData().catch(() => null);
  const name = await verifyTask(String(form?.get("t") ?? ""));
  if (!name) return page(`<h2 style="margin-top:0">הקישור לא תקין</h2>`);
  try {
    const { url } = await createTask(name, "נוצר אוטומטית מהדוח היומי בלוח הבקרה של Leaders.");
    return page(`<h2 style="margin-top:0;color:#15803d">✓ המשימה נוצרה</h2>${url ? `<p style="margin-bottom:0"><a href="${esc(url)}" style="color:#7c3aed;font-weight:600">פתח ב-ClickUp ←</a></p>` : ""}`);
  } catch (e) {
    return page(`<h2 style="margin-top:0">שגיאה ביצירת המשימה</h2><p style="color:#6b7280">${esc((e instanceof Error ? e.message : String(e)).slice(0, 200))}</p>`);
  }
}
