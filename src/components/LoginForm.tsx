"use client";

import { useState } from "react";
import LeadersLogo from "./LeadersLogo";

export default function LoginForm() {
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
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      // Full navigation so the middleware sees the freshly-set cookie.
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next.startsWith("/") ? next : "/";
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  };

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

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              className="login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
            {error && <div className="text-xs text-[var(--bad)]">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading || !password}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
