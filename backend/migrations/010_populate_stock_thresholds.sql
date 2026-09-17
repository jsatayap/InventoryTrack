-- One-time backfill: creates a stock_thresholds row for EVERY active
-- product x active location combination, regardless of whether any stock
-- has ever been received there. Uses a fixed reorder_point default by
-- product type. Safe to re-run -- ON CONFLICT DO NOTHING never overwrites a
-- threshold you've already customized via the Manage Thresholds UI.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/backfill_stock_thresholds_full.sql
--
-- Adjust the two default values below to taste before running.

BEGIN;

INSERT INTO stock_thresholds (product_id, location_id, reorder_point)
SELECT
    p.id,
    l.id,
    CASE WHEN p.is_serialized THEN 3 ELSE 15 END AS reorder_point
FROM products p
CROSS JOIN locations l
WHERE p.is_active
  AND l.is_active
ON CONFLICT (product_id, location_id) DO NOTHING;

COMMIT;

-- Sanity check afterwards -- should equal (active products) x (active locations),
-- minus anything that already had a threshold before this ran:
--   SELECT count(*) FROM stock_thresholds;