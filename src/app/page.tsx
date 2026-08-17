import { redirect } from "next/navigation";
import { resolveRange } from "@/lib/dates";
import { getServerSession, allowedBrands } from "@/lib/serverSession";

export const dynamic = "force-dynamic";

// Root → the user's first brand as a clean URL (/<client>). Also the compatibility shim for legacy
// /?brand=<id> links (old bookmarks, the pre-refactor sidebar): they redirect to /<id>, preserving
// the date window + client-preview flag.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; from?: string; to?: string; as?: string }>;
}) {
  const sp = await searchParams;
  const session = await getServerSession();
  const allowed = allowedBrands(session);
  if (!session || allowed.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="panel p-6 text-sm text-[var(--muted)]">לא הוקצו מותגים לחשבון שלך. פנה ל-Leaders.</div>
      </main>
    );
  }
  const brandId = allowed.some((b) => b.id === sp.brand) ? sp.brand! : allowed[0].id;
  const range = resolveRange(sp);
  const rangeQs = range.key === "custom" ? `range=custom&from=${range.from}&to=${range.to}` : `range=${range.key}`;
  redirect(`/${brandId}?${rangeQs}${sp.as === "client" ? "&as=client" : ""}`);
}
