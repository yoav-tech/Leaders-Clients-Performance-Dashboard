-- Schema + security for the Leaders Clients Performance Dashboard cache.
-- Idempotent: safe to re-run. Apply via `npm run db:setup` OR by pasting into the
-- Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).

CREATE TABLE IF NOT EXISTS daily_metrics (
  date            DATE        NOT NULL,
  brand_id        TEXT        NOT NULL,
  channel         TEXT        NOT NULL,        -- google | meta | tiktok | site
  spend           NUMERIC     NOT NULL DEFAULT 0,   -- native currency
  purchases       NUMERIC     NOT NULL DEFAULT 0,
  revenue         NUMERIC     NOT NULL DEFAULT 0,   -- native currency
  native_currency TEXT        NOT NULL DEFAULT 'ILS',
  spend_ils       NUMERIC     NOT NULL DEFAULT 0,
  revenue_ils     NUMERIC     NOT NULL DEFAULT 0,
  impressions     NUMERIC     NOT NULL DEFAULT 0,   -- ad channels
  clicks          NUMERIC     NOT NULL DEFAULT 0,   -- ad channels
  new_purchases   NUMERIC     NOT NULL DEFAULT 0,   -- site channel: new-customer orders
  new_revenue_ils NUMERIC     NOT NULL DEFAULT 0,   -- site channel: new-customer revenue
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, brand_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics (date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_brand ON daily_metrics (brand_id);

-- Awareness/leads metrics (views/reach for views brands; leads for leads brands). Additive,
-- default 0 so ecommerce rows are unaffected. Every client (ecommerce/views/leads) now persists.
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS reach           NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS views           NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS completed_views NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS leads           NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS installs        NUMERIC NOT NULL DEFAULT 0;  -- app brands (Haat)

-- Store customer first-seen dates, to classify orders as new vs returning.
CREATE TABLE IF NOT EXISTS store_customers (
  brand_id    TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  first_seen  DATE NOT NULL,
  PRIMARY KEY (brand_id, customer_id)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  date  DATE    NOT NULL,
  base  TEXT    NOT NULL,      -- e.g. USD
  quote TEXT    NOT NULL,      -- e.g. ILS
  rate  NUMERIC NOT NULL,
  PRIMARY KEY (date, base, quote)
);

-- Constrain channel to the known set (idempotent).
DO $$ BEGIN
  ALTER TABLE daily_metrics
    ADD CONSTRAINT daily_metrics_channel_chk CHECK (channel IN ('google','meta','tiktok','site'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Data protection ----
-- Enable Row Level Security with NO policies: anon/authenticated (the public Supabase
-- Data API roles) are denied. The app uses the service_role key, which bypasses RLS,
-- so server-side reads/writes keep working. This makes the tables non-readable through
-- the public REST API even if the anon key leaks.
ALTER TABLE daily_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_customers ENABLE ROW LEVEL SECURITY;

-- Defense in depth: strip table privileges from the public API roles entirely.
REVOKE ALL ON daily_metrics   FROM anon, authenticated;
REVOKE ALL ON fx_rates        FROM anon, authenticated;
REVOKE ALL ON store_customers FROM anon, authenticated;

-- ---- Comms panel (ClickUp digest + alerts + Q&A) ----
CREATE TABLE IF NOT EXISTS alerts_sent (
  brand_id  text NOT NULL,
  alert_key text NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, alert_key)
);
CREATE TABLE IF NOT EXISTS clickup_state (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Store-attributed channel funnel (first-party UTM) + raw-source daily breakdown.
CREATE TABLE IF NOT EXISTS daily_utm (
  date date NOT NULL,
  brand_id text NOT NULL,
  channel text NOT NULL,        -- meta | google | tiktok
  purchases numeric NOT NULL DEFAULT 0,
  revenue_ils numeric NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, brand_id, channel)
);
CREATE TABLE IF NOT EXISTS daily_source (
  date date NOT NULL,
  brand_id text NOT NULL,
  source text NOT NULL,         -- raw utm_source
  orders numeric NOT NULL DEFAULT 0,
  revenue_ils numeric NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, brand_id, source)
);
ALTER TABLE daily_utm    ENABLE ROW LEVEL SECURITY; ALTER TABLE daily_utm    FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_source ENABLE ROW LEVEL SECURITY; ALTER TABLE daily_source FORCE ROW LEVEL SECURITY;
REVOKE ALL ON daily_utm    FROM anon, authenticated;
REVOKE ALL ON daily_source FROM anon, authenticated;

ALTER TABLE alerts_sent   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_sent   FORCE  ROW LEVEL SECURITY;
ALTER TABLE clickup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE clickup_state FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON alerts_sent   FROM anon, authenticated;
REVOKE ALL ON clickup_state FROM anon, authenticated;

-- Dashboard users for per-client access control. Three roles:
--   admin   — the team's shared login; sees every brand and the management consoles.
--   manager — a Leaders-side brand manager, scoped to brand_ids. Sees the full dashboard for
--             those brands, and is who that brand's reports and monthly media plan are emailed
--             to (see recipients.ts — attaching a manager here is the only place that is set).
--   client  — the client themselves, scoped to brand_ids, on the trimmed client view.
-- role=admin sees every brand; manager/client are scoped to brand_ids. A single client can have multiple user rows (share brand_ids).
-- password_hash is scrypt ("scrypt$N$r$p$salthex$hashhex"). Accessed only via service_role.
-- Login is by username OR email. The team logs in as the reserved username "admin" (verified
-- against DASHBOARD_PASSWORD, no row here). Clients are created by an admin with a username, then
-- self-onboard via an invite link (full_name, email, phone, password) which activates the row.
-- Surrogate uuid PK so username stays editable; invited_by links a client's team members (≤3) to
-- the primary client that invited them.
CREATE TABLE IF NOT EXISTS dashboard_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  email         text UNIQUE,                       -- collected at onboarding (NULL until then)
  full_name     text,
  phone         text,
  password_hash text,                              -- NULL until the invited user sets their password
  role          text NOT NULL DEFAULT 'client',   -- 'admin' | 'manager' | 'client'
  brand_ids     text[] NOT NULL DEFAULT '{}',
  invited_by    uuid REFERENCES dashboard_users(id) ON DELETE CASCADE,  -- primary client; deleting them removes their team
  invited_at    timestamptz,                       -- set when created via invite, cleared on activation
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON dashboard_users FROM anon, authenticated;

-- ---- Monthly media plans ----
-- Built automatically on the 24th for the NEXT calendar month, reviewed by a media manager,
-- and only emailed to the client's account manager once approved. One row per (brand, month).
--   lines     — the plan itself: one entry per channel × funnel stage (budget + forecast).
--   basis     — the lookback window and per-cell history the allocation was derived from, so an
--               approved plan stays explainable after the underlying data moves on.
--   status    — draft (built, awaiting review) → approved (manager signed off) → sent (emailed).
CREATE TABLE IF NOT EXISTS media_plans (
  brand_id           text NOT NULL,
  month              text NOT NULL,                     -- YYYY-MM the plan covers
  status             text NOT NULL DEFAULT 'draft',     -- draft | approved | sent
  profile            text NOT NULL DEFAULT 'ecommerce', -- ecommerce | views | leads | app | impshare
  budget_source      text NOT NULL DEFAULT 'fixed',     -- fixed (client-set) | proposed (performance-derived)
  total_budget       numeric NOT NULL DEFAULT 0,        -- the plan's budget (ILS); editable until approval
  baseline_budget    numeric NOT NULL DEFAULT 0,        -- previous month's actual spend (ILS)
  recommended_budget numeric NOT NULL DEFAULT 0,        -- what the scale model suggests (ILS)
  lines              jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale          jsonb NOT NULL DEFAULT '[]'::jsonb,
  basis              jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by        text,
  approved_at        timestamptz,
  sent_to            text[] NOT NULL DEFAULT '{}',
  sent_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, month)
);
DO $$ BEGIN
  ALTER TABLE media_plans
    ADD CONSTRAINT media_plans_status_chk CHECK (status IN ('draft','approved','sent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_media_plans_month ON media_plans (month);
ALTER TABLE media_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_plans FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON media_plans FROM anon, authenticated;

-- ---- Unit economics per ecommerce client ----
-- Where a client's ROAS target comes from: their own margin, fulfilment cost and how much of the
-- contribution they are willing to spend acquiring an order. Collected from the client before the
-- first media plan and re-confirmed when prices or costs move. One row per brand.
CREATE TABLE IF NOT EXISTS brand_economics (
  brand_id                  text PRIMARY KEY,
  aov                       numeric NOT NULL,           -- ILS, ex-VAT
  gross_margin_pct          numeric NOT NULL,           -- 0..1
  shipping_per_order        numeric NOT NULL DEFAULT 0, -- ILS
  payment_fee_pct           numeric NOT NULL DEFAULT 0, -- 0..1
  other_variable_per_order  numeric NOT NULL DEFAULT 0, -- ILS
  target_profit_share       numeric NOT NULL DEFAULT 0, -- 0..1, kept as profit rather than spent
  ltv_multiple              numeric NOT NULL DEFAULT 1, -- >= 1, contribution over first order
  source                    text,                       -- who at the client supplied these
  notes                     text,
  collected_at              timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_economics ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_economics FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON brand_economics FROM anon, authenticated;

-- ---- Marketing command center (Leaders / Bestie) ----
-- A native content Gantt the CEO approves. content_items = the calendar posts (organic, per
-- platform); content_month_approvals = the monthly sign-off; briefs = creative briefs for moves.
-- Uploaded assets live in the `content-assets` Storage bucket (same Supabase project); asset_path
-- is a bucket path, or an external URL when asset_kind = 'link'.
CREATE TABLE IF NOT EXISTS content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         text NOT NULL,
  scheduled_date   date NOT NULL,
  platform         text NOT NULL,                 -- instagram | facebook | linkedin
  title            text NOT NULL DEFAULT '',
  body             text NOT NULL DEFAULT '',
  asset_path       text,                          -- Storage path, or external URL when kind='link'
  asset_kind       text NOT NULL DEFAULT 'link',  -- image | video | link
  brief_id         uuid,
  status           text NOT NULL DEFAULT 'draft', -- draft|pending|approved|changes_requested|scheduled|published
  client_feedback  text NOT NULL DEFAULT '',
  created_by       text,
  approved_by      text,
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_items_brand_date ON content_items (brand_id, scheduled_date);
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON content_items FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS content_month_approvals (
  brand_id     text NOT NULL,
  month        text NOT NULL,                     -- YYYY-MM
  status       text NOT NULL DEFAULT 'draft',     -- draft|pending|approved
  note         text NOT NULL DEFAULT '',
  approved_by  text,
  approved_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, month)
);
ALTER TABLE content_month_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_month_approvals FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON content_month_approvals FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS briefs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text NOT NULL,
  title         text NOT NULL DEFAULT '',
  objective     text NOT NULL DEFAULT '',
  audience      text NOT NULL DEFAULT '',
  key_message   text NOT NULL DEFAULT '',
  channels      text[] NOT NULL DEFAULT '{}',
  budget        numeric,
  start_date    date,
  end_date      date,
  status        text NOT NULL DEFAULT 'draft',    -- draft|active|done
  notes         text NOT NULL DEFAULT '',
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefs_brand ON briefs (brand_id);
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON briefs FROM anon, authenticated;

-- ---- Per-city budget change requests (client -> media managers) ----
-- One row per brand+city holding the client's CURRENT ask (upserted, not a log) — the notification
-- email sent on each save is the audit trail. Either budget may be null: the client can ask to
-- change only the daily or only the monthly figure for a city.
CREATE TABLE IF NOT EXISTS budget_requests (
  brand_id        text NOT NULL,
  city            text NOT NULL,
  daily_budget    numeric,
  monthly_budget  numeric,
  note            text NOT NULL DEFAULT '',
  requested_by    text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, city)
);
ALTER TABLE budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_requests FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON budget_requests FROM anon, authenticated;

-- ---- Per-day product sales for store clients (top-products in the client report) ----
-- PRIVACY: product name, units and revenue only — no order ids or customer fields.
-- Ingested because QuickShop's order list omits line items and its analytics summary is locked to
-- a rolling 30 days, so an exact-range ranking needs one request per order.
CREATE TABLE IF NOT EXISTS store_product_daily (
  brand_id   text NOT NULL,
  date       date NOT NULL,
  product    text NOT NULL,
  quantity   numeric NOT NULL DEFAULT 0,
  revenue    numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (brand_id, date, product)
);
CREATE INDEX IF NOT EXISTS idx_store_product_daily_brand_date ON store_product_daily (brand_id, date);
ALTER TABLE store_product_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_product_daily FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON store_product_daily FROM anon, authenticated;

-- ---- Snapshots of external spreadsheets, captured on a schedule ----
-- One row per source (e.g. 'haat/weekly-registration'). The dashboard reads the stored snapshot,
-- so a page render never depends on Google being reachable.
CREATE TABLE IF NOT EXISTS sheet_snapshots (
  key         text PRIMARY KEY,
  payload     jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sheet_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_snapshots FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON sheet_snapshots FROM anon, authenticated;

-- ---- Automations on/off (super-admin console) ----
-- One row per scheduled automation the owner has toggled. Missing row = enabled (default ON).
CREATE TABLE IF NOT EXISTS automation_settings (
  key         text PRIMARY KEY,               -- the cronAuth label, e.g. 'cron/digest'
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON automation_settings FROM anon, authenticated;

-- ---- What the managers taught the recommendation engine ----
-- One row per (brand, rule). 'approved' records that the generated wording is right for this
-- client; 'corrected' stores the manager's own wording as a template whose figures are
-- placeholders ({{gain|ils}}), so it is re-rendered against each new period's numbers instead of
-- replaying the period it was written in. Keyed by brand: the same finding is phrased differently
-- for different clients, and a correction is a judgement about one account.
CREATE TABLE IF NOT EXISTS insight_feedback (
  brand_id      text NOT NULL,
  insight_id    text NOT NULL,                 -- reportInsights InsightId, e.g. 'creative-spread'
  status        text NOT NULL,                 -- 'approved' | 'corrected'
  template      text,                          -- corrected wording, figures placeholdered
  corrected_raw text,                          -- exactly what the manager typed (audit)
  original      text,                          -- the generated line they reacted to
  unresolved    text[] NOT NULL DEFAULT '{}',  -- figures in the correction we couldn't bind
  drop_count    integer NOT NULL DEFAULT 0,    -- consecutive times the manager deleted it before sending
  suppressed    boolean NOT NULL DEFAULT false,-- drop_count hit the limit: stop drafting this rule here
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, insight_id)
);
ALTER TABLE insight_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_feedback FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON insight_feedback FROM anon, authenticated;

-- ---- What the drafted conclusions looked like, so the send can be diffed against them ----
-- Written when a manager generates a draft; read when they send the report. The difference between
-- the two is what teaches the engine (insightLearning.ts) — no approve/correct step is asked for.
CREATE TABLE IF NOT EXISTS insight_drafts (
  brand_id   text NOT NULL,
  from_date  date NOT NULL,
  to_date    date NOT NULL,
  lines      jsonb NOT NULL,                 -- [{ id, text, data }]
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, from_date, to_date)
);
ALTER TABLE insight_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_drafts FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON insight_drafts FROM anon, authenticated;

-- ---- Media-plan targets a media manager can set from the dashboard ----
-- The plan lines live in brands.ts; these rows override them per platform, so a mid-flight revision
-- is a form submission rather than a code change. A NULL column falls back to the signed plan,
-- which keeps the signed figures visible instead of being silently replaced by a zero.
CREATE TABLE IF NOT EXISTS platform_plan_targets (
  brand_id        text NOT NULL,
  platform        text NOT NULL,              -- meta | tiktok | youtube
  budget          numeric,
  thruplay        numeric,                    -- 15-second view target
  completed_views numeric,                    -- 100% view target
  updated_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, platform)
);
ALTER TABLE platform_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plan_targets FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON platform_plan_targets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS platform_plan_lead_targets (
  brand_id   text PRIMARY KEY,
  leads      numeric,
  cpa        numeric,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_plan_lead_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plan_lead_targets FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON platform_plan_lead_targets FROM anon, authenticated;

-- ---- Brand goals a media manager can set from the dashboard ----
-- ROAS / cost-per-view / cost-per-lead / cost-per-registration and the monthly budget lived only in
-- brands.ts, so changing a client's target meant a commit and a deploy. A NULL column falls back to
-- the configured value, which keeps it visible and makes an override deliberate.
CREATE TABLE IF NOT EXISTS brand_targets (
  brand_id       text PRIMARY KEY,
  monthly_budget numeric,
  target_roas    numeric,
  target_cpv     numeric,
  target_cpl     numeric,
  target_cp_reg  numeric,
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_targets FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON brand_targets FROM anon, authenticated;
