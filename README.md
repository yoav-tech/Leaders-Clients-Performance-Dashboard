# Leaders — Clients Performance Dashboard

One-screen paid-media performance across Leaders' 4 e-commerce clients (Argania, La Beaute,
Studio Pasha, Seacret) over Google Ads, Meta, and TikTok — plus real store revenue and
blended ROAS. All money is normalised to **ILS**.

## How it works

```
Vercel Cron ──► /api/cron/ingest ──► Windsor.ai REST API ──► Neon Postgres (daily_metrics)
                                                                    │
Dashboard (Next.js App Router) ◄────────── reads the cache ◄────────┘
```

- **Data pipe:** [Windsor.ai](https://windsor.ai) REST API (one integration for Google, Meta,
  TikTok, Shopify). The Meta/Adspirer MCPs only work inside a Claude session, so the deployed
  app cannot use them — Windsor is the server-callable source.
- **Freshness:** a scheduled snapshot (`vercel.json` cron, 3×/day) upserts into Postgres; the
  page reads the cache for instant loads and keeps history for trends.
- **Currency:** USD accounts (Seacret) are converted to ILS with a daily stored FX rate.

## Setup

1. **Install:** `npm install`
2. **Provision DB:** add Vercel's Neon/Postgres integration to the project (sets `DATABASE_URL`).
3. **Env:** copy `.env.example` → `.env.local`, fill `DATABASE_URL`, `WINDSOR_API_KEY`, `CRON_SECRET`.
4. **Create tables:** `npm run db:setup`
5. **Connect Windsor connectors:** add **Meta (`facebook`)**, **TikTok (`tiktok`)**, and
   **Shopify (`shopify`)** accounts in Windsor (Google is already connected). Then map each
   brand's Google/TikTok account IDs and Shopify store IDs in [`src/lib/brands.ts`](src/lib/brands.ts).
6. **Verify field IDs:** for each newly connected connector, confirm the spend/purchases/revenue
   field IDs and adjust [`src/lib/channelFields.ts`](src/lib/channelFields.ts) (Google is verified).
7. **Backfill:** `npm run ingest -- 2026-06-15 2026-07-15`
8. **Run locally:** `npm run dev` → http://localhost:3000

## Deploy

Push to `main` → Vercel builds and deploys. Set `DATABASE_URL`, `WINDSOR_API_KEY`, and
`CRON_SECRET` in the Vercel project env. The cron is defined in `vercel.json`.

Manual ingest against the deployment:
`GET /api/cron/ingest?secret=<CRON_SECRET>&from=2026-07-01&to=2026-07-15`

## Status / open items

- Meta account IDs are set. **Google + TikTok account IDs and Shopify store IDs are TODO**
  (`null` in `brands.ts`) — the ingester skips a channel with no account id.
- **QuickShop** site revenue (Argania, Studio Pasha) is not yet wired — pending API/export access.
- Field IDs for `facebook`/`tiktok`/`shopify` in `channelFields.ts` are best-effort defaults to
  verify on connect.
- No auth gate yet — add one before sharing (shows client revenue).
