# Leaders — Clients Performance Dashboard

One-screen paid-media performance across Leaders' 4 e-commerce clients (Argania, La Beaute,
Studio Pasha, Seacret) over Google Ads, Meta, and TikTok — plus real store revenue and
blended ROAS. All money is normalised to **ILS**.

## How it works

```
Vercel Cron ──► /api/cron/ingest ──► Windsor.ai REST API ──► Supabase Postgres (daily_metrics)
                                                                    │
Dashboard (Next.js App Router) ◄────────── reads the cache ◄────────┘
```

- **Data pipe:** [Windsor.ai](https://windsor.ai) REST API (one integration for Google, Meta,
  TikTok, Shopify). The Meta/Adspirer MCPs only work inside a Claude session, so the deployed
  app cannot use them — Windsor is the server-callable source.
- **Freshness:** a scheduled snapshot (`vercel.json` cron, 3×/day) upserts into Postgres; the
  page reads the cache for instant loads and keeps history for trends.
- **Currency:** USD accounts (Seacret) are converted to ILS with a daily stored FX rate.

## Monthly media plans

On the **24th of each month** (`/api/cron/media-plan`) the app builds next month's media plan
for every client and stores it as a **draft** — it never mails a client on its own.

```
24th 05:00 UTC ──► build a draft per client ──► media_plans (status=draft)
                                                     │
                     review email to the media managers (one digest, all clients)
                                                     │
              /media-plan  →  edit the budget · rebuild · אשר ושלח
                                                     │
                          the client's account manager gets the final plan
```

- **Structure:** each plan is a set of lines — **channel × funnel stage**, with a budget, a share
  of the total, the change vs last month, and a forecast. The stages adapt to the client type
  (`campaignProfileOf`): ecommerce → prospecting / retargeting / shopping / search; views →
  reach / views / influencers / UGC; leads, app installs and impression-share get their own sets.
- **Budget:** a client with `monthlyBudget` set in `brands.ts` gets that as a **fixed** budget;
  a client without one gets a **proposed** budget. Either way the plan carries a performance-based
  recommendation (`recommendedBudget`) so scaling is a visible decision — the scale factor comes
  from the brand's KPI vs its target over the last 90 days, capped at +20% / −15% per month.
- **Allocation:** share of recent spend per channel × funnel stage, tilted by how each cell
  performed against the brand's KPI target, then bounded (no cell under 3% or over 60%) and
  rounded to ₪50. The per-channel rates come from `daily_metrics`; Windsor campaign names supply
  only the funnel split, so a Windsor outage degrades the plan to channel level instead of failing.
- **Rationale:** written by Claude from the plan's own numbers when `ANTHROPIC_API_KEY` is set;
  otherwise deterministic bullets generated from the same data.

Setup beyond the base install: run `npm run db:setup` again (creates `media_plans`), and set
`EMAIL_MANAGER_<BRAND_ID>` for each client — **"אשר ושלח" stays disabled for a brand with no
account manager configured**. Optional: `ANTHROPIC_API_KEY`, `APP_BASE_URL`.

Manual runs (same auth as the other crons):

```
GET /api/cron/media-plan?secret=<CRON_SECRET>&dry=1              # preview, stores nothing
GET /api/cron/media-plan?secret=<CRON_SECRET>&month=2026-09      # build a specific month
GET /api/cron/media-plan?secret=<CRON_SECRET>&brand=argania      # one client
```

`npm run check:media-plan` verifies the builder and the email renderers against every brand.

## Setup

1. **Install:** `npm install`
2. **Provision DB:** create a Supabase project; use its *Transaction pooler* connection string (port 6543) as `DATABASE_URL`.
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
- **Auth:** a shared-password gate (HTTP Basic Auth) protects the dashboard when
  `DASHBOARD_PASSWORD` is set in the Vercel env (see `.env.example`). Set it before sharing.
