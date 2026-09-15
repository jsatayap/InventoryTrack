-- Migration: invoices.status varchar -> integer (config codes)
--            + drop issues.reason_type (trade_code alone is sufficient)
--
-- Depends on migration 002 (config table with category='invoice' codes:
--   '00' pending, '01' receiving, '02' completed, '03' cancelled)
--
-- Run this once against the live database. Take a backup first.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. invoices.status: text -> integer, using the same codes already
--    seeded in config (category='invoice'). Stored as int here (not
--    as '00'/'01' text) to match how products_actual.status works.
-- ---------------------------------------------------------------------
ALTER TABLE invoices
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE invoices
    ALTER COLUMN status TYPE integer USING (
        CASE status
            WHEN 'pending'   THEN 0
            WHEN 'receiving' THEN 1
            WHEN 'completed' THEN 2
            WHEN 'cancelled' THEN 3
            ELSE 0
        END
    );

ALTER TABLE invoices
    ALTER COLUMN status SET DEFAULT 0;

ALTER TABLE invoices
    ALTER COLUMN status SET NOT NULL;

-- Note: config currently stores these codes as '00'..'03' (zero-padded
-- text) to match products_actual's convention. Comparisons against the
-- new integer column should join as: cfg.key = invoices.status::text
-- OR cfg.key = lpad(invoices.status::text, 2, '0') if you want to keep
-- the zero-padded key. Easiest: re-key config to unpadded digits for
-- category='invoice' so it matches product_unit_status's style:
UPDATE config SET key = '0' WHERE category = 'invoice' AND key = '00';
UPDATE config SET key = '1' WHERE category = 'invoice' AND key = '01';
UPDATE config SET key = '2' WHERE category = 'invoice' AND key = '02';
UPDATE config SET key = '3' WHERE category = 'invoice' AND key = '03';

-- ---------------------------------------------------------------------
-- 2. issues.reason_type: drop column. trade_code alone now drives the
--    reason (transfer/adjust/wasted come straight from config category
--    'issue'); the 'trade_code' | 'trade_description' distinction is no
--    longer needed.
-- ---------------------------------------------------------------------
ALTER TABLE issues
    DROP COLUMN IF EXISTS reason_type;

COMMIT;

-- ---------------------------------------------------------------------
-- After running this, verify:
--   \d invoices          (status should now be integer, default 0, not null)
--   \d issues            (reason_type should be gone)
--   SELECT status, count(*) FROM invoices GROUP BY status;
--   SELECT * FROM config WHERE category = 'invoice' ORDER BY key;
-- ---------------------------------------------------------------------