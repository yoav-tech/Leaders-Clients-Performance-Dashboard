"use client";

import { useState } from "react";
import LeadersLogo from "./LeadersLogo";

export default function InviteForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { setError("הסיסמאות אינן תואמות"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok && j.ok) {
      setDone(true);
      setTimeout(() => { window.location.href = "/login"; }, 1600);
    } else setError(j.error ?? "שגיאה");
  };

  return (
    <div className="login-bg">
      <div className="login-glow">
        <div className="login-inner">
          <div className="mb-6 text-center">
            <div className="mb-4 flex justify-center"><LeadersLogo height={44} /></div>
            <h1 className="login-title text-2xl font-bold">Clients Performance</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">ברוכים הבאים — קבעו סיסמה כדי להיכנס</p>
          </div>

          {!token ? (
            <div className="text-center text-sm text-[var(--muted)]">קישור הזמנה חסר או שגוי.</div>
          ) : done ? (
            <div className="text-center text-sm" style={{ color: "#f4f4f5" }}>הסיסמה נקבעה ✓ מעבירים אתכם לכניסה…</div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3" dir="rtl">
              <input className="login-input" type="password" placeholder="סיסמה חדשה (8+ תווים)" value={pw}
                onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="new-password" />
              <input className="login-input" type="password" placeholder="אימות סיסמה" value={pw2}
                onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
              <button className="login-btn" type="submit" disabled={loading || pw.length < 8 || !pw2}>
                {loading ? "שומר…" : "קבע סיסמה והיכנס"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
