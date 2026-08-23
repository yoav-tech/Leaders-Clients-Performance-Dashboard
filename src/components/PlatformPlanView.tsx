import type { BrandConfig } from "@/lib/brands";
import type { PlatformPlanExecution, PlatformLineExecution } from "@/lib/platformPlan";
import { formatIls, formatNumber } from "@/lib/metrics";

// Chery / Xpeng — per-platform plan-vs-execution. Overview (spend vs media plan), headline cost &
// target-attainment KPIs (CPV 15s, % of 15s-view target, % of 100%-view target), then a per-platform
// planned-vs-actual table. Live from Windsor, leaders campaigns only.

const pct1 = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const ils2 = (v: number | null) => (v == null ? "—" : `₪${v.toFixed(2)}`);
const platIcon = (p: string) => (p === "meta" ? "Meta" : p === "tiktok" ? "TikTok" : "YouTube");

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
        {note && <div className="text-[11px] text-[var(--muted)]" dir="ltr">{note}</div>}
      </div>
      {children}
    </div>
  );
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${tone ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

// Tone by pace: attainment ÷ elapsed-fraction. ≥0.95 on/ahead (good), ≥0.75 slightly behind (warn), else behind.
function paceTone(attain: number | null, elapsedFrac: number): string {
  if (attain == null) return "text-[var(--muted)]";
  const r = elapsedFrac > 0 ? attain / elapsedFrac : attain;
  if (r >= 0.95) return "text-[var(--good)]";
  if (r >= 0.75) return "text-[var(--warn)]";
  return "text-[var(--bad)]";
}

export default function PlatformPlanView({ brand, exec, isClient = false }: { brand: BrandConfig; exec: PlatformPlanExecution | null; isClient?: boolean }) {
  if (!exec) return <div className="panel p-4 text-sm text-[var(--muted)]">אין נתוני פריסת מדיה.</div>;
  const T = exec.totals;
  const elapsedFrac = exec.totalDays > 0 ? exec.elapsedDays / exec.totalDays : 0;
  const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  // Conversions from all leaders campaigns; CPL charged only to dedicated leadgen campaigns (bonus
  // conversions from views campaigns don't inflate it).
  const totalLeads = exec.leads.reduce((s, l) => s + l.leads, 0);
  const totalLeadgenLeads = exec.leads.reduce((s, l) => s + l.leadgenLeads, 0);
  const totalLeadgenSpend = exec.leads.reduce((s, l) => s + l.leadgenSpend, 0);
  const cplTotal = totalLeadgenLeads ? totalLeadgenSpend / totalLeadgenLeads : null;
  const bonusLeads = totalLeads - totalLeadgenLeads;
  const hasLeads = totalLeads > 0;
  const hasLeadgen = totalLeadgenLeads > 0;
  // Optional lead goal (Xpeng): 470 leads @ ₪153 CPA — % attainment against the flight, CPL vs target.
  const leadTarget = brand.platformPlan?.leadTarget ?? null;
  const leadsPct = leadTarget && leadTarget.leads ? totalLeads / leadTarget.leads : null;
  const cplTone = cplTotal != null && leadTarget ? (cplTotal <= leadTarget.cpa ? "text-[var(--good)]" : cplTotal <= leadTarget.cpa * 1.15 ? "text-[var(--warn)]" : "text-[var(--bad)]") : "";
  const extraBubbles = (hasLeads ? 1 : 0) + (hasLeadgen ? 1 : 0);
  const overviewCols = extraBubbles === 2 ? "sm:grid-cols-3 lg:grid-cols-6" : extraBubbles === 1 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4";

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-[var(--muted)]">
        <span>{brand.name} · פריסת מדיה מול ביצוע · קמפייני Leaders בלבד</span>
        <span dir="ltr">{fmtD(exec.flightStart)}–{fmtD(exec.flightEnd)} · יום {exec.elapsedDays}/{exec.totalDays}</span>
      </div>

      {/* Overview — spend vs media plan */}
      <Panel title="מבט על · הוצאה מול פריסת המדיה">
        <div className={`grid grid-cols-2 gap-2 ${overviewCols}`}>
          <Stat label="תקציב פריסה" value={formatIls(T.budget)} />
          <Stat label="הוצאה בפועל" value={formatIls(T.spend)} sub={`${pct1(T.spendPct)} מהתקציב`} />
          <Stat label="נותר" value={formatIls(Math.max(0, T.budget - T.spend))} />
          <Stat label="קצב זמן" value={pct1(elapsedFrac)} sub={`${exec.elapsedDays} מתוך ${exec.totalDays} ימים`} />
          {hasLeads && leadTarget ? (
            <Stat label={`לידים · יעד ${formatNumber(leadTarget.leads)}`} value={`${formatNumber(totalLeads)} / ${formatNumber(leadTarget.leads)}`} sub={`${pct1(leadsPct)} מהיעד · ${formatNumber(bonusLeads)} בונוס`} tone={paceTone(leadsPct, elapsedFrac)} />
          ) : hasLeads ? (
            <Stat label="סה״כ לידים / המרות" value={formatNumber(totalLeads)} sub={hasLeadgen ? `${formatNumber(totalLeadgenLeads)} Leadgen · ${formatNumber(bonusLeads)} בונוס` : "בונוס מקמפייני צפיות"} />
          ) : null}
          {hasLeadgen && <Stat label="עלות לליד · CPL" value={cplTotal == null ? "—" : formatIls(cplTotal)} sub={leadTarget ? `יעד ₪${formatNumber(leadTarget.cpa)}` : "קמפייני Leadgen בלבד"} tone={cplTone} />}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
          <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (T.spendPct ?? 0) * 100)}%` }} />
        </div>
      </Panel>

      {/* Cost & target attainment */}
      <Panel title="עלות צפייה ועמידה ביעד">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="CPV · צפיית 15 שנ׳" value={ils2(T.cpv)} sub={`יעד ${ils2(T.planCpv)}`} tone={T.cpv != null && T.planCpv != null ? (T.cpv <= T.planCpv ? "text-[var(--good)]" : "text-[var(--bad)]") : ""} />
          <Stat label="עמידה ביעד · 15 שנ׳" value={pct1(T.thruplayPct)} sub={`${formatNumber(T.thruplay)} / ${formatNumber(T.thruplayTarget)}`} tone={paceTone(T.thruplayPct, elapsedFrac)} />
          <Stat label="עמידה ביעד · צפייה מלאה 100%" value={pct1(T.completedPct)} sub={`${formatNumber(T.completedViews)} / ${formatNumber(T.completedTarget)}`} tone={paceTone(T.completedPct, elapsedFrac)} />
          <Stat label="צפיות מלאות בפועל" value={formatNumber(T.completedViews)} />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">צבע לפי קצב: ירוק = בקצב/מקדים את היעד היחסי לזמן שחלף, כתום/אדום = מפגר.</div>
      </Panel>

      {/* Per-platform planned vs actual */}
      <Panel title="לפי פלטפורמה · תכנון מול ביצוע" note={isClient ? undefined : "live · Windsor"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-1.5 text-right">פלטפורמה</th>
                <th className="px-2 py-1.5 text-left">תקציב</th>
                <th className="px-2 py-1.5 text-left">הוצאה</th>
                <th className="px-2 py-1.5 text-left">% תקציב</th>
                <th className="px-2 py-1.5 text-left">CPV 15ש׳</th>
                <th className="px-2 py-1.5 text-left">15ש׳ · יעד</th>
                <th className="px-2 py-1.5 text-left">15ש׳ · בפועל</th>
                <th className="px-2 py-1.5 text-left">% עמידה</th>
                <th className="px-2 py-1.5 text-left">100% · יעד</th>
                <th className="px-2 py-1.5 text-left">100% · בפועל</th>
                <th className="px-2 py-1.5 text-left">% עמידה</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {exec.lines.map((l: PlatformLineExecution) => (
                <tr key={l.line.platform + l.line.title} className="border-t border-[var(--card-border)]">
                  <td className="px-2 py-1.5 text-right font-medium">
                    {l.line.title}
                    {!l.connected && <span className="mr-1 text-[11px] text-[var(--muted)]"> · לא מחובר</span>}
                  </td>
                  <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatIls(l.line.budget)}</td>
                  <td className="px-2 py-1.5 text-left font-semibold">{formatIls(l.actual.spend)}</td>
                  <td className="px-2 py-1.5 text-left">{pct1(l.spendPct)}</td>
                  <td className={`px-2 py-1.5 text-left ${l.cpv != null && l.planCpv != null ? (l.cpv <= l.planCpv ? "text-[var(--good)]" : "text-[var(--bad)]") : ""}`}>{ils2(l.cpv)}</td>
                  <td className="px-2 py-1.5 text-left text-[var(--muted)]">{l.line.thruplay ? formatNumber(l.line.thruplay) : "—"}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(l.actual.thruplay)}</td>
                  <td className={`px-2 py-1.5 text-left font-medium ${paceTone(l.thruplayPct, elapsedFrac)}`}>{pct1(l.thruplayPct)}</td>
                  <td className="px-2 py-1.5 text-left text-[var(--muted)]">{l.line.completedViews ? formatNumber(l.line.completedViews) : "—"}</td>
                  <td className="px-2 py-1.5 text-left">{formatNumber(l.actual.completedViews)}</td>
                  <td className={`px-2 py-1.5 text-left font-medium ${paceTone(l.completedPct, elapsedFrac)}`}>{pct1(l.completedPct)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--card-border)] font-semibold">
                <td className="px-2 py-1.5 text-right">סה״כ</td>
                <td className="px-2 py-1.5 text-left">{formatIls(T.budget)}</td>
                <td className="px-2 py-1.5 text-left">{formatIls(T.spend)}</td>
                <td className="px-2 py-1.5 text-left">{pct1(T.spendPct)}</td>
                <td className="px-2 py-1.5 text-left">{ils2(T.cpv)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(T.thruplayTarget)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(T.thruplay)}</td>
                <td className={`px-2 py-1.5 text-left ${paceTone(T.thruplayPct, elapsedFrac)}`}>{pct1(T.thruplayPct)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(T.completedTarget)}</td>
                <td className="px-2 py-1.5 text-left">{formatNumber(T.completedViews)}</td>
                <td className={`px-2 py-1.5 text-left ${paceTone(T.completedPct, elapsedFrac)}`}>{pct1(T.completedPct)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">15ש׳ = צפיית 15 שניות (Meta ThruPlay · TikTok 6ש׳ · YouTube ≈TrueView/75% צפייה) · 100% = צפייה מלאה · הוצאה בדולרים הומרה לשקלים. ל-YouTube אין יעד מוגדר, לכן אינו נכלל ב-% העמידה וב-CPV הכולל. קמפייני לידים (Leadgen) מופרדים מטה ואינם משוקללים במדדי הצפיות.</div>
      </Panel>

      {/* Leads / conversions from all leaders campaigns (views campaigns convert too) */}
      {exec.leads.length > 0 && (
        <Panel title="לידים / המרות · קמפייני Leaders" note="Meta = לידים (טפסים) · TikTok/Google = המרות">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-right">פלטפורמה</th>
                  <th className="px-2 py-1.5 text-left">סה״כ המרות</th>
                  <th className="px-2 py-1.5 text-left">מתוכם Leadgen</th>
                  <th className="px-2 py-1.5 text-left">בונוס (צפיות)</th>
                  <th className="px-2 py-1.5 text-left">הוצאת Leadgen</th>
                  <th className="px-2 py-1.5 text-left">CPL</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {exec.leads.map((l) => (
                  <tr key={l.platform} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-right font-medium">{l.title}</td>
                    <td className="px-2 py-1.5 text-left font-semibold">{formatNumber(l.leads)}</td>
                    <td className="px-2 py-1.5 text-left">{l.leadgenLeads ? formatNumber(l.leadgenLeads) : "—"}</td>
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatNumber(l.leads - l.leadgenLeads)}</td>
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]">{l.leadgenSpend ? formatIls(l.leadgenSpend) : "—"}</td>
                    <td className="px-2 py-1.5 text-left font-medium">{l.cpl == null ? "—" : formatIls(l.cpl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-[var(--muted)]">CPL מחושב מהוצאת קמפייני ה-Leadgen בלבד. המרות מקמפייני צפיות (Awareness) הן בונוס ואינן מייקרות את העלות לליד. לצ׳רי אין קמפיין Leadgen ייעודי, לכן כל ההמרות שלה בונוס.</div>
        </Panel>
      )}

      {/* By influencer */}
      {exec.creators.length > 0 && (
        <Panel title="לפי משפיען">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-right">משפיען</th>
                  <th className="px-2 py-1.5 text-left">הוצאה</th>
                  <th className="px-2 py-1.5 text-left">% מההוצאה</th>
                  <th className="px-2 py-1.5 text-left">CPV 15ש׳</th>
                  <th className="px-2 py-1.5 text-left">צפיות 15ש׳</th>
                  <th className="px-2 py-1.5 text-left">צפיות 100%</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {exec.creators.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-right font-medium">{c.name}</td>
                    <td className="px-2 py-1.5 text-left font-semibold">{formatIls(c.spend)}</td>
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]">{pct1(T.spend ? c.spend / T.spend : null)}</td>
                    <td className="px-2 py-1.5 text-left">{ils2(c.cpv)}</td>
                    <td className="px-2 py-1.5 text-left">{formatNumber(c.thruplay)}</td>
                    <td className="px-2 py-1.5 text-left">{formatNumber(c.completedViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* By content */}
      {exec.contents.length > 0 && (
        <Panel title="לפי תוכן" note={`${exec.contents.length} יצירות`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-2 py-1.5 text-right">תוכן</th>
                  <th className="px-2 py-1.5 text-right">משפיען</th>
                  <th className="px-2 py-1.5 text-left">פלטפורמה</th>
                  <th className="px-2 py-1.5 text-left">הוצאה</th>
                  <th className="px-2 py-1.5 text-left">CPV 15ש׳</th>
                  <th className="px-2 py-1.5 text-left">צפיות 15ש׳</th>
                  <th className="px-2 py-1.5 text-left">צפיות 100%</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {exec.contents.map((c, i) => (
                  <tr key={i} className="border-t border-[var(--card-border)]">
                    <td className="px-2 py-1.5 text-right font-medium">{c.content}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--muted)]">{c.creatorName}</td>
                    <td className="px-2 py-1.5 text-left text-[var(--muted)]" dir="ltr">{c.platforms}</td>
                    <td className="px-2 py-1.5 text-left font-semibold">{formatIls(c.spend)}</td>
                    <td className="px-2 py-1.5 text-left">{ils2(c.cpv)}</td>
                    <td className="px-2 py-1.5 text-left">{formatNumber(c.thruplay)}</td>
                    <td className="px-2 py-1.5 text-left">{formatNumber(c.completedViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
