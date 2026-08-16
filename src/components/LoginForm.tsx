"use client";

import { useState } from "react";
import AuthShell from "./AuthShell";

export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error")
      ? "שם משתמש/מייל או סיסמה שגויים"
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read straight from the DOM, not React state: browser autofill (esp. Safari) fills the
    // inputs without firing onChange, so `identifier`/`password` state can be stale-empty even
    // though the fields look full. The form is the source of truth on submit.
    const form = e.currentTarget;
    const id = ((form.elements.namedItem("identifier") as HTMLInputElement)?.value ?? identifier).trim();
    const pw = (form.elements.namedItem("password") as HTMLInputElement)?.value ?? password;
    if (!id || !pw) {
      setError("יש למלא שם משתמש/מייל וסיסמה");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: id, password: pw }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } else {
      setError("שם משתמש/מייל או סיסמה שגויים");
      setLoading(false);
    }
  };

  // Native form target (used only if JS hasn't hydrated yet). POST → no password in the URL;
  // the API detects the form post and redirects. `next` is carried through so the redirect lands right.
  const nextParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  const action = nextParam && nextParam.startsWith("/") ? `/api/login?next=${encodeURIComponent(nextParam)}` : "/api/login";

  return (
    <AuthShell title="כניסה" subtitle="התחברות ללוח הבקרה">
      <form onSubmit={submit} method="POST" action={action} className="flex flex-col gap-3" dir="rtl">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[rgba(244,244,245,0.6)]">שם משתמש או מייל</span>
          <input
            className="auth-input"
            type="text"
            name="identifier"
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
              style={{ paddingLeft: "3.5rem" }}
              type={showPw ? "text" : "password"}
              name="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-xs text-[rgba(244,244,245,0.5)] hover:text-[rgba(244,244,245,0.9)]"
              tabIndex={-1}
            >
              {showPw ? "הסתר" : "הצג"}
            </button>
          </div>
        </label>
        {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
        <button className="auth-btn mt-1" type="submit" disabled={loading}>
          {loading ? "מתחבר…" : "← התחברות"}
        </button>
      </form>
    </AuthShell>
  );
}
