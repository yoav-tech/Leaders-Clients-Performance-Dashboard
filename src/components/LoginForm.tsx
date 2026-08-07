"use client";

import { useState } from "react";
import LeadersLogo from "./LeadersLogo";

type Mode = "team" | "client";

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("team");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "client" ? { email: email.trim(), password } : { password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } else {
      setError(mode === "client" ? "מייל או סיסמה שגויים" : "סיסמה שגויה");
      setLoading(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); setError(""); }}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${mode === m ? "bg-[rgba(139,92,246,0.9)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
      style={mode === m ? {} : { color: "rgba(244,244,245,0.6)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="login-bg">
      <div className="login-glow">
        <div className="login-inner">
          <div className="mb-6 text-center">
            <div className="mb-4 flex justify-center">
              <LeadersLogo height={44} />
            </div>
            <h1 className="login-title text-2xl font-bold">Clients Performance</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">Sign in to view the dashboard</p>
          </div>

          <div className="mb-3 flex gap-1 rounded-lg border border-[rgba(255,255,255,0.12)] p-1">
            {tab("team", "צוות Leaders")}
            {tab("client", "לקוח")}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3" dir="rtl">
            {mode === "client" && (
              <input
                className="login-input"
                type="email"
                placeholder="מייל"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
            )}
            <input
              className="login-input"
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={mode === "team"}
              autoComplete="current-password"
            />
            {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading || !password || (mode === "client" && !email.trim())}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
