"use client";

import { useState } from "react";

// Small self-service "change password" popover for logged-in client users.
export default function PasswordChanger() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.ok) {
      setMsg("סיסמה עודכנה ✓");
      setCurrent("");
      setNext("");
      setTimeout(() => setOpen(false), 1200);
    } else {
      setMsg(j.error ?? "שגיאה");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[var(--card-border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        סיסמה
      </button>
      {open && (
        <form onSubmit={submit} className="absolute right-0 z-40 mt-1 flex w-60 flex-col gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-lg">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">שינוי סיסמה</div>
          <input type="password" placeholder="סיסמה נוכחית" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password"
            className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm" />
          <input type="password" placeholder="סיסמה חדשה (8+ תווים)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
            className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1 text-sm" />
          {msg && <div className="text-[11px] text-[var(--muted)]">{msg}</div>}
          <button type="submit" disabled={busy || !current || next.length < 8}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">
            {busy ? "מעדכן…" : "עדכן"}
          </button>
        </form>
      )}
    </div>
  );
}
