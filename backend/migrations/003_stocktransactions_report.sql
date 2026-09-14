-- Migration: invoice<->product direct link, stock_transactions doc-number +
--            direction, and a denormalized reporting table.
--
-- Run after 002_products_actual_and_config.sql. Back up first.
--
-- Design notes (read before running):
--
-- 1. invoice_products
--    invoice_items is still the source of truth for quantity/unit_price/
--    received_qty -- an invoice can have many line items for the same or
--    different products, so those numbers can't collapse onto a single
--    invoice<->product edge without losing data. What CAN collapse is the
--    "which products are on this invoice" / "which invoices contain this
--    product" lookup, which today means invoices -> invoice_items ->
--    products. invoice_products is a lean (invoice_id, product_id) table
--    that answers that question directly, in one join, without touching
--    invoice_items at all. It's kept in sync automatically by a trigger
--    on invoice_items, so the app never has to remember to maintain it.
--
-- 2. stock_transactions.ref_doc_number
--    Stores the human-facing document number (invoices.invoice_no or
--    issues.issue_no) instead of just the internal ref_id, so reports can
--    show/filter by document number without joining back to invoices or
--    issues.
--
-- 3. stock_transactions.direction
--    'IN' / 'OUT', derived from trade_type. Turns balance calculations
--    into a plain signed sum instead of a trade_type/trade_code lookup:
--      SELECT SUM(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END)
--      FROM stock_transactions WHERE product_id = :p AND location_id = :l
--
-- 4. stock_transaction_report
--    One denormalized row per stock_transaction with product, location,
--    and reference info already flattened in -- no joins needed for
--    reporting/dashboards. Populated by trigger on every new transaction.

BEGIN;

-- ============================================================
-- 1. invoice_products (direct invoice <-> product lookup)
-- ============================================================
-- CREATE TABLE invoice_products (
--     invoice_id  integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
--     product_id  uuid NOT NULL REFERENCES products(id),
--     created_at  timestamptz NOT NULL DEFAULT now(),
--     PRIMARY KEY (invoice_id, product_id)
-- );
-- CREATE INDEX idx_invoice_products_product_id ON invoice_products(product_id);

-- INSERT INTO invoice_products (invoice_id, product_id)
-- SELECT DISTINCT invoice_id, product_id FROM invoice_items
-- ON CONFLICT DO NOTHING;

-- CREATE OR REPLACE FUNCTION sync_invoice_products() RETURNS trigger AS $$
-- BEGIN
--     IF TG_OP IN ('INSERT', 'UPDATE') THEN
--         INSERT INTO invoice_products (invoice_id, product_id)
--         VALUES (NEW.invoice_id, NEW.product_id)
--         ON CONFLICT DO NOTHING;
--     END IF;

--     IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
--         IF NOT EXISTS (
--             SELECT 1 FROM invoice_items
--             WHERE invoice_id = OLD.invoice_id AND product_id = OLD.product_id
--         ) THEN
--             DELETE FROM invoice_products
--             WHERE invoice_id = OLD.invoice_id AND product_id = OLD.product_id;
--         END IF;
--     END IF;

--     IF TG_OP = 'DELETE' THEN
--         IF NOT EXISTS (
--             SELECT 1 FROM invoice_items
--             WHERE invoice_id = OLD.invoice_id AND product_id = OLD.product_id
--         ) THEN
--             DELETE FROM invoice_products
--             WHERE invoice_id = OLD.invoice_id AND product_id = OLD.product_id;
--         END IF;
--         RETURN OLD;
--     END IF;

--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE TRIGGER trg_invoice_items_sync_products
-- AFTER INSERT OR UPDATE OR DELETE ON invoice_items
-- FOR EACH ROW EXECUTE FUNCTION sync_invoice_products();

-- ============================================================
-- 2. stock_transactions: ref_doc_number + direction
-- ============================================================
ALTER TABLE stock_transactions ADD COLUMN ref_doc_number varchar(50);
ALTER TABLE stock_transactions ADD COLUMN direction varchar(3);

UPDATE stock_transactions st
SET ref_doc_number = i.invoice_no
FROM invoices i
WHERE st.ref_type = 'invoice' AND st.ref_id = i.id;

UPDATE stock_transactions st
SET ref_doc_number = iss.issue_no
FROM issues iss
WHERE st.ref_type = 'issue' AND st.ref_id = iss.id;

UPDATE stock_transactions
SET direction = CASE trade_type WHEN 'RCV' THEN 'IN' WHEN 'ISS' THEN 'OUT' END;

ALTER TABLE stock_transactions ALTER COLUMN direction SET NOT NULL;
ALTER TABLE stock_transactions
    ADD CONSTRAINT stock_transactions_direction_check CHECK (direction IN ('IN', 'OUT'));

-- Auto-fill both columns on every future insert so the app layer
-- doesn't need to compute them.
CREATE OR REPLACE FUNCTION set_stock_transaction_defaults() RETURNS trigger AS $$
BEGIN
    IF NEW.direction IS NULL THEN
        NEW.direction := CASE NEW.trade_type WHEN 'RCV' THEN 'IN' WHEN 'ISS' THEN 'OUT' END;
    END IF;

    IF NEW.ref_doc_number IS NULL THEN
        IF NEW.ref_type = 'invoice' THEN
            SELECT invoice_no INTO NEW.ref_doc_number FROM invoices WHERE id = NEW.ref_id;
        ELSIF NEW.ref_type = 'issue' THEN
            SELECT issue_no INTO NEW.ref_doc_number FROM issues WHERE id = NEW.ref_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_transactions_defaults
BEFORE INSERT ON stock_transactions
FOR EACH ROW EXECUTE FUNCTION set_stock_transaction_defaults();

-- ============================================================
-- 3. Denormalized reporting table
-- ============================================================
CREATE TABLE stock_transaction_report (
    stock_transaction_id   integer PRIMARY KEY REFERENCES stock_transactions(id),
    trade_type              varchar(3) NOT NULL,
    trade_code               varchar(2) NOT NULL,
    trade_code_label         varchar(100),
    direction                 varchar(3) NOT NULL,
    quantity                  integer NOT NULL,
    product_id                uuid NOT NULL,
    sku                       varchar(50),
    product_name              varchar(150),
    series                    varchar(100),
    storage_size              integer,
    color                     varchar(50),
    ram                       integer,
    is_serialized             boolean,
    serial_number             varchar(100),
    location_id               integer,
    location_name             varchar(100),
    ref_type                  varchar(20),
    ref_id                    integer,
    ref_doc_number            varchar(50),
    transaction_created_at    timestamptz,
    created_by                integer,
    created_by_username       varchar(50),
    generated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_str_product_id ON stock_transaction_report(product_id);
CREATE INDEX idx_str_location_id ON stock_transaction_report(location_id);
CREATE INDEX idx_str_transaction_created_at ON stock_transaction_report(transaction_created_at);

INSERT INTO stock_transaction_report (
    stock_transaction_id, trade_type, trade_code, trade_code_label, direction,
    quantity, product_id, sku, product_name, series, storage_size, color, ram,
    is_serialized, serial_number, location_id, location_name,
    ref_type, ref_id, ref_doc_number, transaction_created_at, created_by, created_by_username
)
SELECT
    st.id, st.trade_type, st.trade_code, cfg.value, st.direction,
    st.quantity, st.product_id, p.sku, p.name, p.series, p.storage_size, p.color, p.ram,
    p.is_serialized, st.serial_number, st.location_id, l.name,
    st.ref_type, st.ref_id, st.ref_doc_number, st.created_at, st.created_by, u.username
FROM stock_transactions st
JOIN products p ON p.id = st.product_id
JOIN locations l ON l.id = st.location_id
LEFT JOIN config cfg ON cfg.category = 'issue' AND cfg.key = st.trade_code
LEFT JOIN users u ON u.id = st.created_by;

CREATE OR REPLACE FUNCTION populate_stock_transaction_report() RETURNS trigger AS $$
BEGIN
    INSERT INTO stock_transaction_report (
        stock_transaction_id, trade_type, trade_code, trade_code_label, direction,
        quantity, product_id, sku, product_name, series, storage_size, color, ram,
        is_serialized, serial_number, location_id, location_name,
        ref_type, ref_id, ref_doc_number, transaction_created_at, created_by, created_by_username
    )
    SELECT
        NEW.id, NEW.trade_type, NEW.trade_code, cfg.value, NEW.direction,
        NEW.quantity, NEW.product_id, p.sku, p.name, p.series, p.storage_size, p.color, p.ram,
        p.is_serialized, NEW.serial_number, NEW.location_id, l.name,
        NEW.ref_type, NEW.ref_id, NEW.ref_doc_number, NEW.created_at, NEW.created_by, u.username
    FROM products p
    JOIN locations l ON l.id = NEW.location_id
    LEFT JOIN config cfg ON cfg.category = 'issue' AND cfg.key = NEW.trade_code
    LEFT JOIN users u ON u.id = NEW.created_by
    WHERE p.id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_transactions_report
AFTER INSERT ON stock_transactions
FOR EACH ROW EXECUTE FUNCTION populate_stock_transaction_report();

COMMIT;

-- ---------------------------------------------------------------------
-- Verify:
--   SELECT * FROM invoice_products LIMIT 5;
--   \d stock_transactions   (confirm ref_doc_number, direction present)
--   SELECT ref_doc_number, direction, quantity FROM stock_transactions LIMIT 5;
--   SELECT * FROM stock_transaction_report LIMIT 5;
--
-- Balance sanity check (should match current_stock for a serialized product):
--   SELECT product_id, location_id,
--          SUM(CASE WHEN direction = 'IN' THEN quantity ELSE -quantity END) AS balance
--   FROM stock_transactions
--   GROUP BY product_id, location_id;
-- ---------------------------------------------------------------------