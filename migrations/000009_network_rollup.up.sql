-- Hourly pre-aggregates for the dashboard chart. Re-aggregating raw rows on every
-- refresh took ~1 s (with an on-disk sort) at 500k transactions. A maintenance job
-- now recomputes only the most recent hours each minute; older buckets never change.
CREATE TABLE IF NOT EXISTS network_hourly (
    bucket            TIMESTAMPTZ PRIMARY KEY,
    transaction_count BIGINT      NOT NULL,
    unique_addresses  BIGINT      NOT NULL,
    avg_gas_price     NUMERIC     NOT NULL,
    total_value       NUMERIC     NOT NULL,
    refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
