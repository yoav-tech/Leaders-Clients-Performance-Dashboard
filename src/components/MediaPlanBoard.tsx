"use client";

import { useState } from "react";
import type { StoredPlan } from "@/lib/mediaPlanStore";
import { formatIls, formatNumber } from "@/lib/metrics";

interface BrandOpt { id: string; name: string; hasManager: boolean }

const STATUS_LABEL: Record<string, string> = { draft: "טיוטה", approved: "מאושר", sent: "נשלח" };
const STATUS_TONE: Record<string, string> = {
  draft: "border-[var(--warn)]/40 text-[var(--warn)]",
  approved: "border-[var(--good)]/40 text-[var(--good)]",
  sent: "border-[var(--card-border)] text-[var(--muted)]",
};

const MONTH_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const monthLabel = (m: string) => `${MONTH_HE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function forecastText(p: StoredPlan, l: StoredPlan["lines"][number]): string {
  const f = l.forecast;
  if (p.profile === "ecommerce") return f.revenue == null ? "—" : `${formatIls(f.revenue)}${f.roas ? ` · ROAS ${f.roas.toFixed(1)}` : ""}`;
  if (p.profile === "views") return f.views == null ? formatNumber(f.impressions) : `${formatNumber(f.views)} צפיות`;
  if (p.profile === "leads") return f.leads == null ? "—" : `${formatNumber(f.leads)} לידים`;
  if (p.profile === "app") return f.installs == null ? "—" : `${formatNumber(f.installs)} התקנות`;
  return `${formatNumber(f.impressions)} חשיפות`;
}
function forecastHeader(p: StoredPlan): string {
  return p.profile === "ecommerce" ? "הכנסות צפויות" : p.profile === "views" ? "צפיות" : p.profile === "leads" ? "לידים" : p.profile === "app" ? "התקנות" : "חשיפות";
}

function PlanCard({
  brand,
  plan,
  month,
  onChanged,
}: {
  brand: BrandOpt;
  plan: StoredPlan | null;
  month: string;
  onChanged: (p: StoredPlan) => void;
}) {
  const [busy, setBusy] = useState<"" | "rebuild" | "send">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [budget, setBudget] = useState(plan ? String(Math.round(plan.totalBudget)) : "");
  const [open, setOpen] = useState(false);

  async function call(action: "rebuild" | "send") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/media-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, brandId: brand.id, month, budget: action === "rebuild" ? Number(budget) || undefined : undefined }),
      });
      const j = (await res.json()) as { plan?: StoredPlan; to?: string[]; error?: string };
      if (!res.ok) {
        setMsg({ tone: "err", text: j.error ?? "הפעולה נכשלה" });
        return;
      }
      if (j.plan) {
        onChanged(j.plan);
        setBudget(String(Math.round(j.plan.totalBudget)));
      }
      setMsg({ tone: "ok", text: action === "rebuild" ? "הפריסה נבנתה מחדש" : `נשלח ל-${(j.to ?? []).join(", ")}` });
    } catch {
      setMsg({ tone: "err", text: "שגיאת רשת" });
    } finally {
      setBusy("");
    }
  }

  const status = plan?.status ?? "none";
  const btn = "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:border-[var(--muted)] disabled:opacity-50";

  return (
    <div className="panel p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">{brand.name}</h3>
          {plan ? (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          ) : (
            <span className="rounded-full border border-[var(--card-border)] px-2 py-0.5 text-[11px] text-[var(--muted)]">לא נבנתה</span>
          )}
          {plan && (
            <span className="text-[11px] text-[var(--muted)]">
              {plan.budgetSource === "fixed" ? "תקציב קבוע" : "תקציב מוצע"}
              {plan.recommendedBudget !== plan.totalBudget ? ` · המלצה ${formatIls(plan.recommendedBudget)}` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            תקציב
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="אוטומטי"
              className="w-28 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--foreground)] tabular-nums"
            />
          </label>
          <button className={btn} disabled={busy !== ""} onClick={() => call("rebuild")}>
            {busy === "rebuild" ? "בונה…" : plan ? "בנה מחדש" : "בנה פריסה"}
          </button>
          <button
            className={btn}
            disabled={busy !== "" || !plan || status === "sent" || !brand.hasManager}
            title={!brand.hasManager ? "לא הוגדרה מנהלת לקוח למותג" : status === "sent" ? "כבר נשלח" : "אשר ושלח ללקוח"}
            onClick={() => call("send")}
          >
            {busy === "send" ? "שולח…" : "אשר ושלח"}
          </button>
        </div>
      </div>

      {!brand.hasManager && (
        <p className="mt-2 text-[11px] text-[var(--warn)]">אין נמענת מוגדרת — הוסף EMAIL_MANAGER_{brand.id.toUpperCase().replace(/-/g, "_")} או ערוך את recipients.ts</p>
      )}
      {msg && <p className={`mt-2 text-[11px] ${msg.tone === "ok" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{msg.text}</p>}

      {plan && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-[var(--muted)]">תקציב {monthLabel(month)}</div>
              <div className="text-lg font-bold tabular-nums">{formatIls(plan.totalBudget)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)]">חודש קודם בפועל</div>
              <div className="text-lg font-bold tabular-nums">{formatIls(plan.baselineBudget)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)]">{plan.scale.kpi.toUpperCase()} מול יעד</div>
              <div className="text-lg font-bold tabular-nums">
                {plan.scale.kpiValue == null ? "—" : plan.scale.kpiValue.toFixed(2)}
                <span className="text-[11px] text-[var(--muted)]"> / {plan.scale.kpiTarget ?? "—"}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--muted)]">שינוי מוצע</div>
              <div className={`text-lg font-bold tabular-nums ${plan.scale.factor > 1 ? "text-[var(--good)]" : plan.scale.factor < 1 ? "text-[var(--bad)]" : ""}`}>
                {plan.scale.factor === 1 ? "0%" : `${plan.scale.factor > 1 ? "+" : ""}${Math.round((plan.scale.factor - 1) * 100)}%`}
              </div>
            </div>
          </div>

          {plan.rationale.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pr-5 text-[13px] leading-relaxed">
              {plan.rationale.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          <button className="mt-3 text-[12px] text-[var(--muted)] underline" onClick={() => setOpen((v) => !v)}>
            {open ? "הסתר פריסה" : `הצג פריסה (${plan.lines.length} שורות)`}
          </button>

          {open && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] text-[var(--muted)]">
                    <th className="px-2 py-1.5 text-right">ערוץ</th>
                    <th className="px-2 py-1.5 text-right">שלב בפאנל</th>
                    <th className="px-2 py-1.5 text-right">תקציב</th>
                    <th className="px-2 py-1.5 text-right">חלק</th>
                    <th className="px-2 py-1.5 text-right">מול חודש קודם</th>
                    <th className="px-2 py-1.5 text-right">{forecastHeader(plan)}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map((l) => (
                    <tr key={`${l.channel}-${l.stage}`} className="border-t border-[var(--card-border)] tabular-nums">
                      <td className="px-2 py-2 text-right font-medium">{l.channelLabel}</td>
                      <td className="px-2 py-2 text-right">{l.stageLabel}</td>
                      <td className="px-2 py-2 text-right font-semibold">{formatIls(l.budget)}</td>
                      <td className="px-2 py-2 text-right text-[var(--muted)]">{l.sharePct}%</td>
                      <td className={`px-2 py-2 text-right ${l.deltaPct == null ? "text-[var(--muted)]" : l.deltaPct >= 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
                        {l.deltaPct == null ? "—" : `${l.deltaPct >= 0 ? "+" : ""}${l.deltaPct}%`}
                        <div className="text-[11px] text-[var(--muted)]">{formatIls(l.prevSpend)}</div>
                      </td>
                      <td className="px-2 py-2 text-right">{forecastText(plan, l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                מבוסס על {plan.basis.from} → {plan.basis.to} ({plan.basis.lookbackDays} ימים)
                {plan.basis.stageSource === "channel-only" ? " · פילוח פאנל לא זמין, ברמת ערוץ בלבד" : ""}
                {plan.sentAt ? ` · נשלח ${new Date(plan.sentAt).toLocaleString("he-IL")} אל ${plan.sentTo.join(", ")}` : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MediaPlanBoard({
  brands,
  month,
  initialPlans,
  months,
}: {
  brands: BrandOpt[];
  month: string;
  initialPlans: StoredPlan[];
  months: string[];
}) {
  const [plans, setPlans] = useState<Record<string, StoredPlan>>(
    Object.fromEntries(initialPlans.map((p) => [p.brandId, p])),
  );
  const onChanged = (p: StoredPlan) => setPlans((prev) => ({ ...prev, [p.brandId]: p }));

  const total = Object.values(plans).reduce((s, p) => s + p.totalBudget, 0);
  const pending = Object.values(plans).filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-[11px] text-[var(--muted)]">חודש הפריסה</div>
          <div className="text-lg font-bold">{monthLabel(month)}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--muted)]">סה״כ תקציב מתוכנן</div>
          <div className="text-lg font-bold tabular-nums">{formatIls(total)}</div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--muted)]">ממתינות לאישור</div>
          <div className="text-lg font-bold tabular-nums">{pending}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {months.map((m) => (
            <a
              key={m}
              href={`/media-plan?month=${m}`}
              className={`rounded-md border px-2.5 py-1 text-[12px] ${m === month ? "border-[var(--muted)] font-semibold text-[var(--foreground)]" : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"}`}
            >
              {monthLabel(m)}
            </a>
          ))}
        </div>
      </div>

      {brands.map((b) => (
        <PlanCard key={b.id} brand={b} plan={plans[b.id] ?? null} month={month} onChanged={onChanged} />
      ))}
    </div>
  );
}
