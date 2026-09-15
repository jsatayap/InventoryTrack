-- Migration: config.key varchar -> integer, issues/stock_transactions.trade_code
--            varchar -> integer, and real composite FKs enforcing that
--            invoices.status / products_actual.status / issues.trade_code
--            can only ever hold a value that actually exists in config.
--
-- A composite FK needs both sides to match types AND Postgres has no way to
-- say "FK to config where category = 'invoice'" inline -- so each
-- referencing table gets a small generated column that's always the literal
-- category string, and the FK is on (that column, the code column).
--
-- Run this once against the live database. Take a backup first.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. stock_tracking reads config with a ::text cast that won't make sense
--    once config.key is an integer -- drop it now, recreate at the end.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS stock_tracking;

-- ---------------------------------------------------------------------
-- 1. config.key: varchar -> integer
--    Existing values ('0'-'3' for invoice, '1'-'3' for product_unit_status,
--    '01'/'55'/'99' for issue) are all numeric strings, so the cast is safe.
-- ---------------------------------------------------------------------
ALTER TABLE config
    ALTER COLUMN key TYPE integer USING key::integer;

-- ---------------------------------------------------------------------
-- 2. issues.trade_code / stock_transactions.trade_code: varchar -> integer
--    (stock_transactions also carries '00' for plain receiving, which
--    isn't in config -- that's fine, no FK is added on that table below.)
-- ---------------------------------------------------------------------
ALTER TABLE issues
    ALTER COLUMN trade_code TYPE integer USING trade_code::integer;

ALTER TABLE stock_transactions
    ALTER COLUMN trade_code TYPE integer USING trade_code::integer;

-- ---------------------------------------------------------------------
-- 3. invoices.status -> real FK on config(category='invoice', key)
-- ---------------------------------------------------------------------
ALTER TABLE invoices
    ADD COLUMN status_category varchar(50) GENERATED ALWAYS AS ('invoice') STORED;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_status_fkey
    FOREIGN KEY (status_category, status) REFERENCES config (category, key);

-- ---------------------------------------------------------------------
-- 4. products_actual.status -> real FK on config(category='product_unit_status', key)
-- ---------------------------------------------------------------------
ALTER TABLE products_actual
    ADD COLUMN status_category varchar(50) GENERATED ALWAYS AS ('product_unit_status') STORED;

ALTER TABLE products_actual
    ADD CONSTRAINT products_actual_status_fkey
    FOREIGN KEY (status_category, status) REFERENCES config (category, key);

-- ---------------------------------------------------------------------
-- 5. issues.trade_code -> real FK on config(category='issue', key)
-- ---------------------------------------------------------------------
ALTER TABLE issues
    ADD COLUMN trade_code_category varchar(50) GENERATED ALWAYS AS ('issue') STORED;

ALTER TABLE issues
    ADD CONSTRAINT issues_trade_code_fkey
    FOREIGN KEY (trade_code_category, trade_code) REFERENCES config (category, key);

-- ---------------------------------------------------------------------
-- 6. Recreate stock_tracking -- config.key is now an integer, so the join
--    to product_unit_status compares directly, no ::text cast needed.
-- ---------------------------------------------------------------------
CREATE VIEW stock_tracking AS
 SELECT l.name AS location_name,
    p.name AS product_name,
    p.series,
    p.storage_size,
    p.color,
    p.ram,
    p.extra_specs,
    u.serial_number AS control_serial,
    NULL::integer AS non_control_amount,
    cfg.value AS status
   FROM products_actual u
     JOIN products p ON p.id = u.product_id
     JOIN locations l ON l.id = u.current_location_id
     JOIN config cfg ON cfg.category = 'product_unit_status' AND cfg.key = u.status
UNION ALL
 SELECT l.name AS location_name,
    p.name AS product_name,
    p.series,
    p.storage_size,
    p.color,
    p.ram,
    p.extra_specs,
    NULL::character varying AS control_serial,
    sb.quantity AS non_control_amount,
    'in_stock'::character varying AS status
   FROM stock_balances sb
     JOIN products p ON p.id = sb.product_id
     JOIN locations l ON l.id = sb.location_id;

COMMIT;

-- ---------------------------------------------------------------------
-- After running this, verify:
--   \d config             (key should now be integer)
--   \d invoices            (status_category present, invoices_status_fkey present)
--   \d products_actual     (status_category present, products_actual_status_fkey present)
--   \d issues               (trade_code integer, trade_code_category present, issues_trade_code_fkey present)
--   \d stock_transactions   (trade_code should now be integer)
--   \d stock_tracking       (view exists again)
--   Try: UPDATE invoices SET status = 99 WHERE id = <any id>;  -- should be REJECTED by the FK
-- ---------------------------------------------------------------------