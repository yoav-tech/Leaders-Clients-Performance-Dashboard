import { NextResponse } from "next/server";
import { getServerSession, canAccessBrand } from "@/lib/serverSession";
import { getBrand } from "@/lib/brands";
import { listItems, getMonthApproval, type ContentItem } from "@/lib/contentStore";
import { signedAssetPath } from "@/lib/contentAssetSign";

export const dynamic = "force-dynamic";

// GET /api/content/items?brand=&month=YYYY-MM  → { items, monthApproval, canEdit, canApprove }
// Any role with brand access. Each item gets a display `assetUrl` (signed same-origin proxy for
// uploaded files; the raw external URL for links).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const brand = getBrand(url.searchParams.get("brand") ?? "");
  const month = url.searchParams.get("month") ?? "";
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "bad month" }, { status: 400 });
  const session = await getServerSession();
  if (!canAccessBrand(session, brand.id)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const [items, monthApproval] = await Promise.all([listItems(brand.id, month), getMonthApproval(brand.id, month)]);
    const withUrls = await Promise.all(items.map(async (it: ContentItem) => ({
      ...it,
      assetUrl: !it.assetPath ? null : it.assetKind === "link" ? it.assetPath : await signedAssetPath(it.assetPath),
    })));
    const canEdit = session?.role === "admin" || session?.role === "manager";
    const canApprove = session?.role === "admin" || session?.role === "client";
    return NextResponse.json({ items: withUrls, monthApproval, canEdit, canApprove });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
