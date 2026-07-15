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
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, brand_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics (date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_brand ON daily_metrics (brand_id);

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
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates      ENABLE ROW LEVEL SECURITY;

-- Defense in depth: strip table privileges from the public API roles entirely.
REVOKE ALL ON daily_metrics FROM anon, authenticated;
REVOKE ALL ON fx_rates      FROM anon, authenticated;
