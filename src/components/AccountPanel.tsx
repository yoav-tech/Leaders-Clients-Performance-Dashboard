"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Profile { username: string; email: string; fullName: string; phone: string }
interface TeamMember { id: string; username: string; fullName: string | null; pending: boolean }

const input = "w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm";
const primaryBtn = "rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</div>
      {children}
    </div>
  );
}

export default function AccountPanel({
  isAdmin,
  profile,
  isPrimary,
  team: initialTeam,
  maxTeam,
}: {
  isAdmin: boolean;
  profile: Profile | null;
  isPrimary: boolean;
  team: TeamMember[];
  maxTeam: number;
}) {
  const router = useRouter();

  // Profile
  const [p, setP] = useState<Profile>(profile ?? { username: "", email: "", fullName: "", phone: "" });
  const [pMsg, setPMsg] = useState(""); const [pBusy, setPBusy] = useState(false);
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setPBusy(true); setPMsg("");
    const r = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({})); setPBusy(false);
    if (r.ok && j.ok) { setPMsg("נשמר ✓"); router.refresh(); } else setPMsg(j.error ?? "שגיאה");
  };

  // Password
  const [cur, setCur] = useState(""); const [nxt, setNxt] = useState("");
  const [pwMsg, setPwMsg] = useState(""); const [pwBusy, setPwBusy] = useState(false);
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwBusy(true); setPwMsg("");
    const r = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next: nxt }) });
    const j = await r.json().catch(() => ({})); setPwBusy(false);
    if (r.ok && j.ok) { setPwMsg("הסיסמה עודכנה ✓"); setCur(""); setNxt(""); } else setPwMsg(j.error ?? "שגיאה");
  };

  // Team
  const [team, setTeam] = useState<TeamMember[]>(initialTeam);
  const [tUser, setTUser] = useState(""); const [tMsg, setTMsg] = useState(""); const [tBusy, setTBusy] = useState(false);
  const [tLink, setTLink] = useState(""); const [copied, setCopied] = useState(false);
  const remaining = Math.max(0, maxTeam - team.length);
  const refreshTeam = async () => { const j = await fetch("/api/account/team").then((r) => r.json()).catch(() => ({})); if (j.team) setTeam(j.team); };
  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setTBusy(true); setTMsg(""); setTLink(""); setCopied(false);
    const r = await fetch("/api/account/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: tUser.trim() }) });
    const j = await r.json().catch(() => ({})); setTBusy(false);
    if (r.ok && j.ok) { setTLink(j.inviteUrl); setTUser(""); refreshTeam(); } else setTMsg(j.error ?? "שגיאה");
  };
  const removeMember = async (m: TeamMember) => {
    if (!confirm(`להסיר את ${m.username}?`)) return;
    await fetch(`/api/account/team?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    setTeam((t) => t.filter((x) => x.id !== m.id));
  };
  const copy = async () => { await navigator.clipboard.writeText(tLink).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (isAdmin) {
    return (
      <div dir="rtl" className="max-w-xl">
        <Section title="חשבון צוות">
          <p className="text-sm text-[var(--muted)]">חשבון הצוות (admin) מנוהל דרך הסיסמה המשותפת. אין כאן פרופיל אישי לעריכה.</p>
        </Section>
      </div>
    );
  }

  return (
    <div dir="rtl" className="grid max-w-3xl gap-4 lg:grid-cols-2">
      <Section title="פרופיל">
        <form onSubmit={saveProfile} className="space-y-2">
          <input className={input} placeholder="שם מלא" value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} />
          <input className={input} type="email" dir="ltr" placeholder="מייל" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          <input className={input} type="tel" dir="ltr" placeholder="טלפון" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />
          <input className={input} dir="ltr" placeholder="שם משתמש" value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} />
          {pMsg && <div className="text-xs text-[var(--muted)]">{pMsg}</div>}
          <button className={primaryBtn} disabled={pBusy}>{pBusy ? "שומר…" : "שמור פרופיל"}</button>
        </form>
      </Section>

      <Section title="סיסמה">
        <form onSubmit={savePw} className="space-y-2">
          <input className={input} type="password" dir="ltr" placeholder="סיסמה נוכחית" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          <input className={input} type="password" dir="ltr" placeholder="סיסמה חדשה (8+)" value={nxt} onChange={(e) => setNxt(e.target.value)} autoComplete="new-password" />
          {pwMsg && <div className="text-xs text-[var(--muted)]">{pwMsg}</div>}
          <button className={primaryBtn} disabled={pwBusy || !cur || nxt.length < 8}>{pwBusy ? "מעדכן…" : "עדכן סיסמה"}</button>
        </form>
      </Section>

      {isPrimary && (
        <div className="lg:col-span-2">
          <Section title={`צוות · ${team.length}/${maxTeam}`}>
            <div className="mb-3 space-y-2">
              {team.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm">
                  <div><span className="font-medium" dir="ltr">{m.username}</span>{m.fullName && <span className="mr-2 text-xs text-[var(--muted)]">· {m.fullName}</span>}{m.pending && <span className="mr-2 rounded bg-[var(--warn)]/20 px-1.5 py-0.5 text-[10px] text-[var(--warn)]">ממתין</span>}</div>
                  <button onClick={() => removeMember(m)} className="text-xs text-[var(--bad)] hover:underline">הסר</button>
                </div>
              ))}
              {team.length === 0 && <div className="text-sm text-[var(--muted)]">עדיין לא הזמנת אנשי צוות.</div>}
            </div>
            {remaining > 0 ? (
              <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
                <input className={input + " flex-1"} dir="ltr" placeholder="שם משתמש לחבר צוות" value={tUser} onChange={(e) => setTUser(e.target.value)} />
                <button className={primaryBtn} disabled={tBusy || !tUser.trim()}>{tBusy ? "יוצר…" : "הזמן חבר צוות"}</button>
              </form>
            ) : (
              <div className="text-xs text-[var(--muted)]">הגעת למקסימום ({maxTeam}) אנשי צוות.</div>
            )}
            {tMsg && <div className="mt-2 text-xs text-[var(--bad)]">{tMsg}</div>}
            {tLink && (
              <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/50 p-3">
                <div className="mb-1 text-xs text-[var(--muted)]">קישור הזמנה (שלח לחבר הצוות, תקף 7 ימים):</div>
                <div className="flex items-center gap-2">
                  <input readOnly value={tLink} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-xs" dir="ltr" />
                  <button onClick={copy} className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs text-white">{copied ? "הועתק ✓" : "העתק"}</button>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
