-- Migration: products table rework
--   1. products.id: int -> uuid (PK)
--   2. FKs pointing at products.id: int -> uuid
--      (invoice_items, product_units, stock_balances, issue_items, stock_transactions)
--   3. products.storage_size / products.ram: text -> integer (GB)
--   4. products: add created_by, updated_at, updated_by
--
-- Run this once against the live database. Take a backup first.
-- New rows created after this migration will get their UUIDs from the app
-- (UUIDv7, time-ordered) — this script only needs to backfill existing rows,
-- so it uses gen_random_uuid() (v4) for those.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_uuid()

-- ---------------------------------------------------------------------
-- 0. current_stock and stock_tracking both SELECT from products.id and
--    product_units.product_id, so Postgres won't let us touch those
--    columns while the views still depend on them. Drop them now; they're
--    recreated verbatim (same SQL, captured via pg_get_viewdef) at the
--    end of this script once the underlying columns have their new types.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS current_stock;
DROP VIEW IF EXISTS stock_tracking;

-- ---------------------------------------------------------------------
-- 1. Give every existing product a uuid, keyed off its current int id
-- ---------------------------------------------------------------------
ALTER TABLE products ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

-- ---------------------------------------------------------------------
-- 2. Add matching uuid FK columns to every table that references products.id,
--    and backfill them from the mapping above
-- ---------------------------------------------------------------------
ALTER TABLE invoice_items      ADD COLUMN new_product_id uuid;
ALTER TABLE product_units      ADD COLUMN new_product_id uuid;
ALTER TABLE stock_balances     ADD COLUMN new_product_id uuid;
ALTER TABLE issue_items        ADD COLUMN new_product_id uuid;
ALTER TABLE stock_transactions ADD COLUMN new_product_id uuid;

UPDATE invoice_items t      SET new_product_id = p.new_id FROM products p WHERE p.id = t.product_id;
UPDATE product_units t      SET new_product_id = p.new_id FROM products p WHERE p.id = t.product_id;
UPDATE stock_balances t     SET new_product_id = p.new_id FROM products p WHERE p.id = t.product_id;
UPDATE issue_items t        SET new_product_id = p.new_id FROM products p WHERE p.id = t.product_id;
UPDATE stock_transactions t SET new_product_id = p.new_id FROM products p WHERE p.id = t.product_id;

-- ---------------------------------------------------------------------
-- 3. Drop the old int PK/FK columns and rename the new uuid ones in
-- ---------------------------------------------------------------------
ALTER TABLE invoice_items      DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey;
ALTER TABLE product_units      DROP CONSTRAINT IF EXISTS product_units_product_id_fkey;
ALTER TABLE stock_balances     DROP CONSTRAINT IF EXISTS stock_balances_product_id_fkey;
ALTER TABLE issue_items        DROP CONSTRAINT IF EXISTS issue_items_product_id_fkey;
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_product_id_fkey;

ALTER TABLE invoice_items      DROP COLUMN product_id;
ALTER TABLE product_units      DROP COLUMN product_id;
ALTER TABLE stock_balances     DROP COLUMN product_id;
ALTER TABLE issue_items        DROP COLUMN product_id;
ALTER TABLE stock_transactions DROP COLUMN product_id;

ALTER TABLE invoice_items      RENAME COLUMN new_product_id TO product_id;
ALTER TABLE product_units      RENAME COLUMN new_product_id TO product_id;
ALTER TABLE stock_balances     RENAME COLUMN new_product_id TO product_id;
ALTER TABLE issue_items        RENAME COLUMN new_product_id TO product_id;
ALTER TABLE stock_transactions RENAME COLUMN new_product_id TO product_id;

ALTER TABLE invoice_items      ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE product_units      ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE stock_balances     ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE issue_items        ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE stock_transactions ALTER COLUMN product_id SET NOT NULL;

-- issue_items.product_unit_id already points at product_units.id (untouched, still int)

-- ---------------------------------------------------------------------
-- 4. Swap the PK on products itself
-- ---------------------------------------------------------------------
ALTER TABLE products DROP CONSTRAINT products_pkey;
ALTER TABLE products DROP COLUMN id;
ALTER TABLE products RENAME COLUMN new_id TO id;
ALTER TABLE products ADD PRIMARY KEY (id);

-- ---------------------------------------------------------------------
-- 5. Re-point the FKs at the new uuid PK
-- ---------------------------------------------------------------------
ALTER TABLE invoice_items      ADD CONSTRAINT invoice_items_product_id_fkey      FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_units      ADD CONSTRAINT product_units_product_id_fkey      FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE stock_balances     ADD CONSTRAINT stock_balances_product_id_fkey     FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE issue_items        ADD CONSTRAINT issue_items_product_id_fkey        FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);

-- ---------------------------------------------------------------------
-- 6. storage_size / ram: text -> integer (GB)
--    Strips any non-digit characters first (handles '256GB', '8 GB', etc).
--    Anything that doesn't contain a number at all becomes NULL.
-- ---------------------------------------------------------------------
ALTER TABLE products ADD COLUMN storage_size_int integer;
ALTER TABLE products ADD COLUMN ram_int integer;

UPDATE products
SET storage_size_int = NULLIF(regexp_replace(storage_size, '\D', '', 'g'), '')::integer
WHERE storage_size IS NOT NULL;

UPDATE products
SET ram_int = NULLIF(regexp_replace(ram, '\D', '', 'g'), '')::integer
WHERE ram IS NOT NULL;

ALTER TABLE products DROP COLUMN storage_size;
ALTER TABLE products DROP COLUMN ram;
ALTER TABLE products RENAME COLUMN storage_size_int TO storage_size;
ALTER TABLE products RENAME COLUMN ram_int TO ram;

-- ---------------------------------------------------------------------
-- 7. Audit columns
-- ---------------------------------------------------------------------
ALTER TABLE products ADD COLUMN created_by integer REFERENCES users(id);
ALTER TABLE products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN updated_by integer REFERENCES users(id);
-- created_at already exists from the original schema; left untouched.

-- ---------------------------------------------------------------------
-- 8. Recreate the two views, unchanged, now that the columns they select
--    from have their new types. This is the exact SQL captured from the
--    live database via pg_get_viewdef() before it was dropped in step 0.
-- ---------------------------------------------------------------------
CREATE VIEW current_stock AS
 SELECT p.id AS product_id,
    p.sku,
    p.name,
    p.series,
    p.storage_size,
    p.color,
    p.is_serialized,
    u.current_location_id AS location_id,
    count(*) AS quantity
   FROM products p
     JOIN product_units u ON u.product_id = p.id AND u.status::text = 'in_stock'::text
  WHERE p.is_serialized = true
  GROUP BY p.id, p.sku, p.name, p.series, p.storage_size, p.color, p.is_serialized, u.current_location_id
UNION ALL
 SELECT p.id AS product_id,
    p.sku,
    p.name,
    p.series,
    p.storage_size,
    p.color,
    p.is_serialized,
    sb.location_id,
    sb.quantity
   FROM products p
     JOIN stock_balances sb ON sb.product_id = p.id
  WHERE p.is_serialized = false AND sb.quantity > 0;

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
    u.status
   FROM product_units u
     JOIN products p ON p.id = u.product_id
     JOIN locations l ON l.id = u.current_location_id
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
--   \d products
--   \d invoice_items / product_units / stock_balances / issue_items / stock_transactions
--   \d current_stock / \d stock_tracking  (confirm both views exist again)
-- ---------------------------------------------------------------------