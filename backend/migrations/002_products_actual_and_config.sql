-- Migration: products_actual rename + status code + config table
--   1. product_units -> renamed to products_actual
--   2. products_actual.status: varchar -> integer code
--   3. products_actual columns reordered: id (PK) first, business columns,
--      then created_at, created_by, updated_at, updated_by last (in that order)
--   4. New generic `config` table: category / key / value lookup, seeded
--      with product-unit status codes, issue trade codes, and invoice
--      status codes
--
-- Run this once against the live database. Take a backup first.
-- Postgres has no in-place "reorder columns" operation, so products_actual
-- is built fresh and the old rows are copied across, same approach as
-- migration 001 used for the products table.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. current_stock and stock_tracking both read from product_units, so
--    drop them now and recreate (verbatim intent, updated to point at
--    products_actual / the new status codes) at the end of this script.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS current_stock;
DROP VIEW IF EXISTS stock_tracking;

-- ---------------------------------------------------------------------
-- 1. Generic config table
-- ---------------------------------------------------------------------
CREATE TABLE config (
    id          serial PRIMARY KEY,
    category    varchar(50) NOT NULL,
    key         varchar(20) NOT NULL,
    value       varchar(100) NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  integer REFERENCES users(id),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  integer REFERENCES users(id),
    UNIQUE (category, key)
);

INSERT INTO config (category, key, value, description) VALUES
    -- products_actual.status codes
    ('product_unit_status', '1', 'in_stock', 'Unit is in stock at its current location'),
    ('product_unit_status', '2', 'issued',   'Unit issued out (trade_code 55)'),
    ('product_unit_status', '3', 'wasted',   'Unit written off (trade_code 99)'),

    -- issues.trade_code / stock_transactions.trade_code
    ('issue', '01', 'transfer', 'Stock transferred between locations'),
    ('issue', '55', 'adjust',   'Stock adjustment'),
    ('issue', '99', 'wasted',   'Stock written off as wasted'),

    -- invoices.status (kept as reference/documentation; invoices.status
    -- itself is left as text in this migration since it wasn't part of
    -- the requested change, but is listed here as a config example)
    ('invoice', '00', 'pending',   'Invoice created, nothing received yet'),
    ('invoice', '01', 'receiving', 'Invoice partially received'),
    ('invoice', '02', 'completed', 'Invoice fully received'),
    ('invoice', '03', 'cancelled', 'Invoice cancelled');

-- ---------------------------------------------------------------------
-- 2. Rebuild product_units as products_actual
-- ---------------------------------------------------------------------
CREATE TABLE products_actual (
    id                   serial PRIMARY KEY,
    product_id           uuid NOT NULL REFERENCES products(id),
    serial_number        varchar(100) NOT NULL UNIQUE,
    status               integer NOT NULL DEFAULT 1,  -- see config: category='product_unit_status'
    current_location_id  integer REFERENCES locations(id),
    invoice_item_id      integer REFERENCES invoice_items(id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           integer REFERENCES users(id),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    updated_by           integer REFERENCES users(id)
);

INSERT INTO products_actual (
    id, product_id, serial_number, status, current_location_id, invoice_item_id,
    created_at, created_by, updated_at, updated_by
)
SELECT
    pu.id,
    pu.product_id,
    pu.serial_number,
    CASE pu.status
        WHEN 'in_stock' THEN 1
        WHEN 'issued'   THEN 2
        WHEN 'wasted'   THEN 3
        ELSE 1
    END,
    pu.current_location_id,
    pu.invoice_item_id,
    pu.created_at,
    NULL,   -- product_units had no created_by column
    pu.updated_at,
    NULL    -- product_units had no updated_by column
FROM product_units pu;

SELECT setval(
    pg_get_serial_sequence('products_actual', 'id'),
    COALESCE((SELECT MAX(id) FROM products_actual), 1)
);

-- issue_items.product_unit_id -> repoint FK at the new table
ALTER TABLE issue_items DROP CONSTRAINT IF EXISTS issue_items_product_unit_id_fkey;
ALTER TABLE issue_items
    ADD CONSTRAINT issue_items_product_unit_id_fkey
    FOREIGN KEY (product_unit_id) REFERENCES products_actual(id);

DROP TABLE product_units;

-- ---------------------------------------------------------------------
-- 3. Recreate the views against products_actual. API/frontend still
--    expects 'in_stock' / 'issued' / 'wasted' strings, so stock_tracking
--    joins config to translate the integer code back to text.
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
     JOIN products_actual u ON u.product_id = p.id AND u.status = 1  -- 1 = in_stock
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
    cfg.value AS status
   FROM products_actual u
     JOIN products p ON p.id = u.product_id
     JOIN locations l ON l.id = u.current_location_id
     JOIN config cfg ON cfg.category = 'product_unit_status' AND cfg.key = u.status::text
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
--   \d products_actual   (confirm column order: id, product_id,
--                          serial_number, status, current_location_id,
--                          invoice_item_id, created_at, created_by,
--                          updated_at, updated_by)
--   \d config
--   SELECT * FROM config ORDER BY category, key;
--   \d current_stock / \d stock_tracking (confirm both views exist again)
-- ---------------------------------------------------------------------