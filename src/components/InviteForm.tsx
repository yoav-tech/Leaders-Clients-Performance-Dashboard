"use client";

import { useState } from "react";
import AuthShell from "./AuthShell";

export default function InviteForm({ token, username, valid }: { token: string; username: string; valid: boolean }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fullName, email, phone, password: pw }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok && j.ok) {
      setDone(true);
      setTimeout(() => { window.location.href = "/login"; }, 1800);
    } else setError(j.error ?? "שגיאה");
  };

  if (!valid) {
    return (
      <AuthShell title="הזמנה" subtitle="הצטרפות ללוח הבקרה">
        <div className="text-center text-sm text-[var(--muted)]">קישור ההזמנה אינו תקין, פג תוקף, או שכבר נוצל.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="ברוכים הבאים" subtitle="השלמת פרטים כדי להיכנס ללוח הבקרה">
      {done ? (
        <div className="text-center text-sm" style={{ color: "#f4f4f5" }}>הפרטים נשמרו ✓ מעבירים אתכם לכניסה…</div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" dir="rtl">
          <div className="rounded-md border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--muted)]">
            שם המשתמש שלך: <span className="font-semibold" style={{ color: "#f4f4f5" }} dir="ltr">{username}</span>
          </div>
          <input className="auth-input" placeholder="שם מלא" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus autoComplete="name" />
          <input className="auth-input" type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" />
          <input className="auth-input" type="tel" placeholder="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" dir="ltr" />
          <input className="auth-input" type="password" placeholder="סיסמה (8+ תווים)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
          <button className="auth-btn" type="submit" disabled={loading || !fullName || !email || !phone || pw.length < 8}>
            {loading ? "שומר…" : "צור חשבון והיכנס"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
