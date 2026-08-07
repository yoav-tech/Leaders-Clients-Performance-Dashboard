"use client";

import { useState } from "react";

interface UserSummary {
  email: string;
  role: "admin" | "client";
  brandIds: string[];
  pending: boolean;
}
interface BrandOpt {
  id: string;
  name: string;
}

export default function AdminUsers({ initialUsers, brands }: { initialUsers: UserSummary[]; brands: BrandOpt[] }) {
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const nameOf = (id: string) => brands.find((b) => b.id === id)?.name ?? id;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const refresh = async () => {
    const j = await fetch("/api/admin/users").then((r) => r.json()).catch(() => ({}));
    if (j.users) setUsers(j.users);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setInviteUrl("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), brandIds: [...sel] }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.ok) {
      setInviteUrl(j.inviteUrl);
      setEmail(""); setSel(new Set());
      refresh();
    } else setErr(j.error ?? "שגיאה");
  };

  const reinvite = async (u: UserSummary) => {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, brandIds: u.brandIds, role: u.role }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.inviteUrl) { setInviteUrl(j.inviteUrl); setCopied(false); }
  };

  const remove = async (u: UserSummary) => {
    if (!confirm(`למחוק את ${u.email}?`)) return;
    await fetch(`/api/admin/users?email=${encodeURIComponent(u.email)}`, { method: "DELETE" });
    setUsers((us) => us.filter((x) => x.email !== u.email));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Add client */}
      <div className="panel p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-[var(--muted)]">הזמנת לקוח חדש</div>
        <form onSubmit={create} className="space-y-3">
          <input
            type="email" placeholder="מייל הלקוח" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">מותגים שהלקוח יראה:</div>
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
          <button type="submit" disabled={busy || !email.trim() || sel.size === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "יוצר…" : "צור וקבל קישור הזמנה"}
          </button>
        </form>

        {inviteUrl && (
          <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/50 p-3">
            <div className="mb-1 text-xs text-[var(--muted)]">קישור הזמנה (שלח ללקוח — הוא יקבע סיסמה בעצמו, תקף 7 ימים):</div>
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
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium" dir="ltr">{u.email}</span>
                {u.role === "admin" ? (
                  <span className="mr-2 rounded bg-[var(--card-border)] px-1.5 py-0.5 text-[10px]">admin · כל המותגים</span>
                ) : (
                  <span className="mr-2 text-xs text-[var(--muted)]">· {u.brandIds.map(nameOf).join(", ") || "—"}</span>
                )}
                {u.pending && <span className="mr-2 rounded bg-[var(--warn)]/20 px-1.5 py-0.5 text-[10px] text-[var(--warn)]">ממתין להפעלה</span>}
              </div>
              <div className="flex items-center gap-2">
                {u.role !== "admin" && (
                  <button onClick={() => reinvite(u)} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">קישור הזמנה</button>
                )}
                <button onClick={() => remove(u)} className="text-xs text-[var(--bad)] hover:underline">מחק</button>
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="text-sm text-[var(--muted)]">אין משתמשים עדיין.</div>}
        </div>
      </div>
    </div>
  );
}
