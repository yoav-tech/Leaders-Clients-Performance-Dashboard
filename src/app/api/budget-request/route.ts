import { NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";
import { saveBudgetRequests, type BudgetRequestInput } from "@/lib/budgetRequestStore";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { sameOrigin } from "@/lib/auth";
import { mediaManagers } from "@/lib/recipients";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const ils = (v: number | null) => (v == null ? "—" : `₪${Math.round(v).toLocaleString("en-US")}`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad origin" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const brand = getBrand(String(body.brand ?? ""));
  if (!brand || !canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const note = String(body.note ?? "").slice(0, 2000);
  const rows: BudgetRequestInput[] = (Array.isArray(body.rows) ? body.rows : [])
    .map((r: Record<string, unknown>) => ({ city: String(r.city ?? "").slice(0, 60), daily: num(r.daily), monthly: num(r.monthly) }))
    .filter((r: BudgetRequestInput) => r.city && (r.daily != null || r.monthly != null));

  if (!rows.length) return NextResponse.json({ error: "no budgets to request" }, { status: 400 });

  try {
    await saveBudgetRequests(brand.id, rows, note, session.sub);

    // Notify the media managers (Gal + Yoav) — the email is the record of the ask.
    const subject = rows.length === 1
      ? `בקשת שינוי תקציב · ${brand.name} · ${rows[0].city}`
      : `בקשת שינוי תקציב · ${brand.name} · ${rows.length} ערים`;
    const trs = rows.map((r) => `<tr>
        <td style="padding:6px 10px;border-top:1px solid #e5e7eb;font-weight:600">${esc(r.city)}</td>
        <td style="padding:6px 10px;border-top:1px solid #e5e7eb;text-align:left">${ils(r.daily)}</td>
        <td style="padding:6px 10px;border-top:1px solid #e5e7eb;text-align:left">${ils(r.monthly)}</td>
      </tr>`).join("");
    const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
      <h2 style="margin:0 0 4px">בקשת שינוי תקציב · ${esc(brand.name)}</h2>
      <div style="color:#6b7280;margin-bottom:12px">${esc(session.sub)} · ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>
      <table style="border-collapse:collapse;min-width:360px">
        <thead><tr style="color:#6b7280;font-size:12px;text-align:right">
          <th style="padding:6px 10px">עיר</th>
          <th style="padding:6px 10px;text-align:left">תקציב יומי מבוקש</th>
          <th style="padding:6px 10px;text-align:left">תקציב חודשי מבוקש</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
      ${note ? `<p style="margin-top:14px"><b>הערה:</b><br>${esc(note).replace(/\n/g, "<br>")}</p>` : ""}
    </div>`;

    await sendEmail({ to: mediaManagers(), subject, html, replyTo: session.sub });
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
