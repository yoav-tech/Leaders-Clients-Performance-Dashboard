"use client";

export default function LogoutButton() {
  const logout = async () => {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  };
  return (
    <button
      onClick={logout}
      className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
