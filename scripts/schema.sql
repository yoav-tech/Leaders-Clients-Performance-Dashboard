-- Schema for the Leaders Clients Performance Dashboard cache.
-- Run with: npm run db:setup  (executes this file against DATABASE_URL)

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
