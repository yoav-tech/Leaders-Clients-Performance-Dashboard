"use client";

import { useState } from "react";
import AuthShell from "./AuthShell";

export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } else {
      setError("שם משתמש/מייל או סיסמה שגויים");
      setLoading(false);
    }
  };

  return (
    <AuthShell title="כניסה" subtitle="התחברות ללוח הבקרה">
      <form onSubmit={submit} className="flex flex-col gap-3" dir="rtl">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[rgba(244,244,245,0.6)]">שם משתמש או מייל</span>
          <input
            className="auth-input"
            type="text"
            placeholder="admin או your@email.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoFocus
            autoComplete="username"
            dir="ltr"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[rgba(244,244,245,0.6)]">סיסמה</span>
          <div className="relative">
            <input
              className="auth-input w-full"
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 left-2 flex items-center text-xs text-[rgba(244,244,245,0.5)] hover:text-[rgba(244,244,245,0.9)]"
              tabIndex={-1}
            >
              {showPw ? "הסתר" : "הצג"}
            </button>
          </div>
        </label>
        {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
        <button className="auth-btn mt-1" type="submit" disabled={loading || !identifier.trim() || !password}>
          {loading ? "מתחבר…" : "התחברות →"}
        </button>
      </form>
    </AuthShell>
  );
}
