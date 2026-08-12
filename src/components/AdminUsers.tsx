"use client";

import { useState } from "react";

interface UserSummary {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: "admin" | "manager" | "client";
  brandIds: string[];
  pending: boolean;
}
interface BrandOpt {
  id: string;
  name: string;
}

// Row-action buttons — clearly buttons, not text links.
const chip = "rounded-md border border-[var(--card-border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--panel-border)] hover:text-[var(--foreground)]";
const chipDanger = "rounded-md border border-[var(--bad)]/40 px-2.5 py-1 text-xs text-[var(--bad)] transition-colors hover:bg-[var(--bad)]/10";

// The two roles this console creates. "admin" (the shared team login) is not created here.
const ROLE_OPTIONS: { value: "manager" | "client"; label: string; hint: string }[] = [
  { value: "manager", label: "מנהל מותג", hint: "צוות לידרס — מקבל את הדוחות ואת פריסת המדיה של המותגים שלו" },
  { value: "client", label: "לקוח", hint: "הלקוח עצמו — תצוגת דשבורד מצומצמת, לא מקבל פריסות" },
];

export default function AdminUsers({ initialUsers, brands }: { initialUsers: UserSummary[]; brands: BrandOpt[] }) {
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"manager" | "client">("client");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ username: string; password: string } | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);

  const nameOf = (id: string) => brands.find((b) => b.id === id)?.name ?? id;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const refresh = async () => {
    const j = await fetch("/api/admin/users").then((r) => r.json()).catch(() => ({}));
    if (j.users) setUsers(j.users);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setInviteUrl(""); setCopied(false);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), brandIds: [...sel], role }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.ok) {
      setInviteUrl(j.inviteUrl);
      setUsername(""); setSel(new Set()); setRole("client");
      refresh();
    } else setErr(j.error ?? "שגיאה");
  };

  const reinvite = async (u: UserSummary) => {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, brandIds: u.brandIds, role: u.role }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.inviteUrl) { setInviteUrl(j.inviteUrl); setCopied(false); }
  };

  const remove = async (u: UserSummary) => {
    if (!confirm(`למחוק את ${u.username}?`)) return;
    await fetch(`/api/admin/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    setUsers((us) => us.filter((x) => x.id !== u.id));
  };

  const resetPw = async (u: UserSummary) => {
    if (!confirm(`לאפס סיסמה ל-${u.username}? תיווצר סיסמה זמנית חדשה.`)) return;
    setResetInfo(null); setCopiedPw(false);
    const res = await fetch("/api/admin/users/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) setResetInfo({ username: j.username, password: j.password });
    else alert(j.error ?? "שגיאה");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Create client */}
      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">יצירת גישה</div>
        <form onSubmit={create} className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">סוג המשתמש:</div>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value} type="button" onClick={() => setRole(r.value)} title={r.hint}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${role === r.value ? "border-blue-600 bg-blue-600 text-white" : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">{ROLE_OPTIONS.find((r) => r.value === role)?.hint}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-[var(--muted)]">שם משתמש (הוא יקבל אותו וישלים פרטים בהזמנה):</div>
            <input
              type="text" placeholder="לדוגמה: colgate" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" dir="rtl"
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">{role === "manager" ? "מותגים שהוא מנהל:" : "מותגים שהלקוח יראה:"}</div>
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => (
                <button
                  key={b.id} type="button" onClick={() => toggle(b.id)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${sel.has(b.id) ? "border-blue-600 bg-blue-600 text-white" : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          {err && <div className="text-xs text-[var(--bad)]">{err}</div>}
          <button type="submit" disabled={busy || !username.trim() || sel.size === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "יוצר…" : `צור ${role === "manager" ? "מנהל מותג" : "לקוח"} וקבל קישור הזמנה`}
          </button>
        </form>

        {inviteUrl && (
          <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/50 p-3">
            <div className="mb-1 text-xs text-[var(--muted)]">קישור הזמנה (שלח למשתמש — הוא ישלים שם/מייל/טלפון ויקבע סיסמה, תקף 7 ימים. המייל שהוא ימלא הוא הכתובת שאליה יישלחו הדוחות):</div>
            <div className="flex items-center gap-2">
              <input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-xs" dir="ltr" />
              <button onClick={copy} className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs text-white">{copied ? "הועתק ✓" : "העתק"}</button>
            </div>
          </div>
        )}
      </div>

      {/* Existing users */}
      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">משתמשים ({users.length})</div>
        {resetInfo && (
          <div className="mb-3 rounded-lg border border-[var(--panel-border)] bg-[var(--background)]/50 p-3">
            <div className="mb-1 text-xs text-[var(--muted)]">סיסמה זמנית חדשה ל-<span className="font-semibold" dir="ltr">{resetInfo.username}</span> (העבר למשתמש; הוא יוכל לשנות ב&quot;החשבון שלי&quot;):</div>
            <div className="flex items-center gap-2">
              <input readOnly value={resetInfo.password} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm" dir="ltr" />
              <button onClick={async () => { await navigator.clipboard.writeText(resetInfo.password).catch(() => {}); setCopiedPw(true); setTimeout(() => setCopiedPw(false), 1500); }} className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs text-white">{copiedPw ? "הועתק ✓" : "העתק"}</button>
              <button onClick={() => setResetInfo(null)} className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium" dir="ltr">{u.username}</span>
                {u.fullName && <span className="mr-2 text-xs text-[var(--muted)]">· {u.fullName}</span>}
                {u.role === "admin" ? (
                  <span className="mr-2 rounded bg-[var(--card-border)] px-1.5 py-0.5 text-[10px]">admin · כל המותגים</span>
                ) : (
                  <>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] ${u.role === "manager" ? "bg-blue-600/20 text-blue-500" : "bg-[var(--card-border)]"}`}>
                      {u.role === "manager" ? "מנהל מותג" : "לקוח"}
                    </span>
                    <span className="mr-1 text-xs text-[var(--muted)]">· {u.brandIds.map(nameOf).join(", ") || "—"}</span>
                  </>
                )}
                {u.pending && <span className="mr-2 rounded bg-[var(--warn)]/20 px-1.5 py-0.5 text-[10px] text-[var(--warn)]">ממתין להשלמה</span>}
              </div>
              <div className="flex items-center gap-2">
                {u.role !== "admin" && (
                  <button onClick={() => reinvite(u)} className={chip}>קישור הזמנה</button>
                )}
                {!u.pending && (
                  <button onClick={() => resetPw(u)} className={chip}>אפס סיסמה</button>
                )}
                <button onClick={() => remove(u)} className={chipDanger}>מחק</button>
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="text-sm text-[var(--muted)]">אין משתמשים עדיין.</div>}
        </div>
      </div>
    </div>
  );
}
