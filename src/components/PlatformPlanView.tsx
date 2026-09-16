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
  const ytLine = exec.lines.find((l) => l.line.platform === "youtube");
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="CPV · צפיית 15 שנ׳" value={ils2(T.cpv)} sub={`יעד ${ils2(T.planCpv)}`} tone={T.cpv != null && T.planCpv != null ? (T.cpv <= T.planCpv ? "text-[var(--good)]" : "text-[var(--bad)]") : ""} />
          <Stat label="עמידה ביעד · 15 שנ׳" value={pct1(T.thruplayPct)} sub={`${formatNumber(T.thruplay)} / ${formatNumber(T.thruplayTarget)}`} tone={paceTone(T.thruplayPct, elapsedFrac)} />
          <Stat label="עמידה ביעד · צפייה מלאה 100%" value={pct1(T.completedPct)} sub={`${formatNumber(T.completedViews)} / ${formatNumber(T.completedTarget)}`} tone={paceTone(T.completedPct, elapsedFrac)} />
          <Stat label="צפיות מלאות בפועל" value={formatNumber(T.completedViews)} />
          {/* Cost per completed view. Unlike the 15-second column this IS comparable across all
              three platforms — everyone counts a 100% view the same way — so YouTube is in it. */}
          <Stat
            label="עלות לצפייה מלאה 100%"
            value={ils2(T.cpCompleted)}
            sub={T.planCpCompleted ? `יעד ${ils2(T.planCpCompleted)}` : "כולל YouTube"}
            tone={T.cpCompleted != null && T.planCpCompleted != null ? (T.cpCompleted <= T.planCpCompleted ? "text-[var(--good)]" : "text-[var(--bad)]") : ""}
          />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">צבע לפי קצב: ירוק = בקצב/מקדים את היעד היחסי לזמן שחלף, כתום/אדום = מפגר.</div>
      </Panel>

      {/* One block per platform, each measured on what that platform actually sells. Meta and TikTok
          are bought on 15-second and 100% views; YouTube has no 15-second metric at all and is bought
          on TrueView, which is itself a different event per ad format — so it gets its own table,
          split the way Google splits it. A single wide table forced all three into one column set and
          left cells that were either blank or, worse, filled with a proxy. */}
      {exec.lines.filter((l) => l.line.platform !== "youtube").map((l: PlatformLineExecution) => (
        <Panel key={l.line.platform + l.line.title} title={`${l.line.title} · תכנון מול ביצוע`} note={isClient ? undefined : "live · Windsor"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="תקציב" value={formatIls(l.line.budget)} />
            <Stat label="הוצאה" value={formatIls(l.actual.spend)} sub={pct1(l.spendPct)} />
            <Stat label="צפיות 15 שנ׳" value={formatNumber(l.actual.thruplay)} sub={l.line.thruplay ? `יעד ${formatNumber(l.line.thruplay)}` : undefined} tone={paceTone(l.thruplayPct, elapsedFrac)} />
            <Stat label="% עמידה · 15 שנ׳" value={pct1(l.thruplayPct)} tone={paceTone(l.thruplayPct, elapsedFrac)} />
            <Stat label="עלות ל-15 שנ׳" value={ils2(l.cpv)} sub={l.planCpv ? `יעד ${ils2(l.planCpv)}` : undefined} tone={l.cpv != null && l.planCpv != null ? (l.cpv <= l.planCpv ? "text-[var(--good)]" : "text-[var(--bad)]") : ""} />
            <Stat label="צפיות מלאות" value={formatNumber(l.actual.completedViews)} sub={l.line.completedViews ? `יעד ${formatNumber(l.line.completedViews)}` : undefined} tone={paceTone(l.completedPct, elapsedFrac)} />
            <Stat label="% עמידה · מלאות" value={pct1(l.completedPct)} tone={paceTone(l.completedPct, elapsedFrac)} />
            <Stat
              label="עלות לצפייה מלאה"
              value={l.actual.completedViews ? ils2(l.actual.spend / l.actual.completedViews) : "—"}
              sub={l.line.completedViews ? `יעד ${ils2(l.line.budget / l.line.completedViews)}` : undefined}
              tone={l.actual.completedViews && l.line.completedViews ? ((l.actual.spend / l.actual.completedViews) <= (l.line.budget / l.line.completedViews) ? "text-[var(--good)]" : "text-[var(--bad)]") : ""}
            />
          </div>
        </Panel>
      ))}

      {ytLine && (
        <Panel title="YouTube · תכנון מול ביצוע" note={isClient ? undefined : "live · Google Ads API"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="תקציב" value={formatIls(ytLine.line.budget)} />
            <Stat label="הוצאה" value={formatIls(ytLine.actual.spend)} sub={pct1(ytLine.spendPct)} />
            <Stat label="TrueView views" value={formatNumber(ytLine.actual.trueviewViews ?? 0)} />
            <Stat label="TrueView CPV" value={ils2(ytLine.actual.trueviewCpv ?? null)} />
          </div>

          {exec.youtubeFormats.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-2 py-1.5 text-right">פורמט</th>
                    <th className="px-2 py-1.5 text-left">הוצאה</th>
                    <th className="px-2 py-1.5 text-left">חשיפות</th>
                    <th className="px-2 py-1.5 text-left">TrueView views</th>
                    <th className="px-2 py-1.5 text-left">TrueView CPV</th>
                    <th className="px-2 py-1.5 text-left">צפיות מלאות</th>
                    <th className="px-2 py-1.5 text-left">עלות לצפייה מלאה</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {exec.youtubeFormats.map((f) => (
                    <tr key={f.format} className="border-t border-[var(--card-border)]">
                      <td className="px-2 py-1.5 text-right font-medium">{f.label}</td>
                      <td className="px-2 py-1.5 text-left font-semibold">{formatIls(f.spend)}</td>
                      <td className="px-2 py-1.5 text-left text-[var(--muted)]">{formatNumber(f.impressions)}</td>
                      <td className="px-2 py-1.5 text-left">{formatNumber(f.trueviewViews)}</td>
                      <td className="px-2 py-1.5 text-left">{ils2(f.trueviewCpv)}</td>
                      <td className="px-2 py-1.5 text-left">{formatNumber(f.completedViews)}</td>
                      <td className="px-2 py-1.5 text-left font-semibold">{ils2(f.cpCompleted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-[11px] text-[var(--muted)]">
            ל-YouTube אין מדד של 15 שניות. TrueView נספר ב-In-stream אחרי 30 שניות (או בסיום הסרטון, או בכל אינטראקציה) וב-Shorts לפי כללים אחרים — ולכן שני הפורמטים מוצגים בנפרד ולא מסוכמים למספר צפיות אחד. הפילוח לפי סיווג הפורמט של גוגל עצמה. צפייה מלאה נמדדת זהה בשלושת הפורמטים ובכל הפלטפורמות, ולכן העמודה האחרונה היא זו שניתנת להשוואה.
          </div>
        </Panel>
      )}


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
        <Panel title="לפי תוכן" note={`${exec.contents.length} שורות · תוכן × פלטפורמה · קישור למודעה במטא`}>
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
                    <td className="px-2 py-1.5 text-right font-medium">
                      {c.previewUrl ? (
                        <a href={c.previewUrl} target="_blank" rel="noopener noreferrer"
                           className="text-blue-500 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                           title="פתח את המודעה">
                          {c.content} <span className="text-[10px] text-[var(--muted)]">↗</span>
                        </a>
                      ) : c.content}
                    </td>
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
