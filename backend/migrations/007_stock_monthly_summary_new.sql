BEGIN;

-- ============================================================
-- 1. Add new columns
-- ============================================================
ALTER TABLE stock_monthly_summary
    ADD COLUMN sku                    VARCHAR(50),
    ADD COLUMN product_name           VARCHAR(150),
    ADD COLUMN series                 VARCHAR(100),
    ADD COLUMN is_serialized          BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN location_code          VARCHAR(20),
    ADD COLUMN location_name          VARCHAR(100),

    ADD COLUMN opening_balance        INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN issued_transfer_qty    INTEGER NOT NULL DEFAULT 0,   -- trade_code 1
    ADD COLUMN issued_adjustment_qty  INTEGER NOT NULL DEFAULT 0,   -- trade_code 55
    ADD COLUMN issued_wasted_qty      INTEGER NOT NULL DEFAULT 0,   -- trade_code 99
    ADD COLUMN total_issued_qty       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN net_change_qty         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN closing_balance        INTEGER NOT NULL DEFAULT 0,

    ADD COLUMN avg_unit_price         NUMERIC(12,2),
    ADD COLUMN received_value         NUMERIC(14,2) GENERATED ALWAYS AS (received_qty * COALESCE(avg_unit_price, 0)) STORED,
    ADD COLUMN issued_value           NUMERIC(14,2) GENERATED ALWAYS AS (total_issued_qty * COALESCE(avg_unit_price, 0)) STORED,

    ADD COLUMN invoice_count          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN transaction_count      INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Backfill denormalized descriptive fields
-- ============================================================
UPDATE stock_monthly_summary sms
SET sku = p.sku, product_name = p.name, series = p.series,
    is_serialized = p.is_serialized, avg_unit_price = p.price
FROM products p
WHERE sms.product_id = p.id;

UPDATE stock_monthly_summary sms
SET location_code = l.code, location_name = l.name
FROM locations l
WHERE sms.location_id = l.id;

-- ============================================================
-- 3. Backfill trade-code breakdown, invoice_count, transaction_count
--    from stock_transactions (source of truth)
-- ============================================================
UPDATE stock_monthly_summary sms
SET issued_transfer_qty   = t.transfer_qty,
    issued_adjustment_qty = t.adjustment_qty,
    issued_wasted_qty     = t.wasted_qty,
    transaction_count     = t.txn_count,
    invoice_count         = t.invoice_count
FROM (
    SELECT
        date_trunc('month', created_at)::date AS month,
        product_id,
        location_id,
        SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 1  THEN quantity ELSE 0 END) AS transfer_qty,
        SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 55 THEN quantity ELSE 0 END) AS adjustment_qty,
        SUM(CASE WHEN trade_type = 'ISS' AND trade_code = 99 THEN quantity ELSE 0 END) AS wasted_qty,
        COUNT(*) AS txn_count,
        COUNT(DISTINCT CASE WHEN trade_type = 'RCV' THEN ref_id END) AS invoice_count
    FROM stock_transactions
    GROUP BY 1, 2, 3
) t
WHERE sms.month = t.month
  AND sms.product_id = t.product_id
  AND sms.location_id = t.location_id;

UPDATE stock_monthly_summary
SET total_issued_qty = issued_transfer_qty + issued_adjustment_qty + issued_wasted_qty,
    net_change_qty    = received_qty - (issued_transfer_qty + issued_adjustment_qty + issued_wasted_qty);

-- ============================================================
-- 4. Backfill opening/closing balances as a running total per
--    (product_id, location_id), ordered by month, starting from 0.
--    NOTE: this assumes stock_transactions is the complete history.
--    If real stock existed before the earliest transaction row
--    (e.g. seeded via stock_balances directly), opening_balance for
--    the first month will be wrong — adjust manually if so.
-- ============================================================
WITH ordered AS (
    SELECT id,
           SUM(net_change_qty) OVER (
               PARTITION BY product_id, location_id
               ORDER BY month
               ROWS UNBOUNDED PRECEDING
           ) AS running_closing
    FROM stock_monthly_summary
)
UPDATE stock_monthly_summary sms
SET closing_balance = o.running_closing,
    opening_balance = o.running_closing - sms.net_change_qty
FROM ordered o
WHERE sms.id = o.id;

-- ============================================================
-- 5. Helper function: recompute balances for one product/location
--    pair across all its months. Called after every new transaction
--    so out-of-order / backdated inserts still produce correct
--    running balances (a plain incremental update can't guarantee this).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_recompute_monthly_balances(p_product_id UUID, p_location_id INTEGER)
RETURNS void AS $$
BEGIN
    WITH ordered AS (
        SELECT id,
               SUM(net_change_qty) OVER (ORDER BY month ROWS UNBOUNDED PRECEDING) AS running_closing
        FROM stock_monthly_summary
        WHERE product_id = p_product_id AND location_id = p_location_id
    )
    UPDATE stock_monthly_summary sms
    SET closing_balance = o.running_closing,
        opening_balance = o.running_closing - sms.net_change_qty
    FROM ordered o
    WHERE sms.id = o.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Replace trigger function to maintain the new columns
--    KNOWN LIMITATION: invoice_count is incremented by +1 whenever
--    a RCV transaction occurs, without checking whether that invoice
--    was already counted this month. If an invoice's items arrive
--    across several receive actions in the same month, invoice_count
--    will overcount. Treat it as approximate; re-run the backfill in
--    step 3 periodically (or on-demand) for an exact figure.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_bump_monthly_summary() RETURNS trigger AS $$
DECLARE
    v_month      DATE := date_trunc('month', NEW.created_at)::date;
    v_transfer   INTEGER := 0;
    v_adjustment INTEGER := 0;
    v_wasted     INTEGER := 0;
    v_received   INTEGER := CASE WHEN NEW.trade_type = 'RCV' THEN NEW.quantity ELSE 0 END;
    v_inv_count  INTEGER := CASE WHEN NEW.trade_type = 'RCV' THEN 1 ELSE 0 END;
BEGIN
    IF NEW.trade_type = 'ISS' THEN
        IF NEW.trade_code = 1 THEN v_transfer := NEW.quantity;
        ELSIF NEW.trade_code = 55 THEN v_adjustment := NEW.quantity;
        ELSIF NEW.trade_code = 99 THEN v_wasted := NEW.quantity;
        END IF;
    END IF;

    INSERT INTO stock_monthly_summary (
        month, product_id, location_id,
        sku, product_name, series, is_serialized, location_code, location_name, avg_unit_price,
        received_qty, issued_qty,
        issued_transfer_qty, issued_adjustment_qty, issued_wasted_qty,
        total_issued_qty, net_change_qty,
        transaction_count, invoice_count
    )
    SELECT
        v_month, NEW.product_id, NEW.location_id,
        p.sku, p.name, p.series, p.is_serialized, l.code, l.name, p.price,
        v_received, (v_transfer + v_adjustment + v_wasted),
        v_transfer, v_adjustment, v_wasted,
        (v_transfer + v_adjustment + v_wasted),
        v_received - (v_transfer + v_adjustment + v_wasted),
        1, v_inv_count
    FROM products p, locations l
    WHERE p.id = NEW.product_id AND l.id = NEW.location_id
    ON CONFLICT (month, product_id, location_id) DO UPDATE SET
        received_qty          = stock_monthly_summary.received_qty + EXCLUDED.received_qty,
        issued_qty             = stock_monthly_summary.issued_qty + EXCLUDED.issued_qty,
        issued_transfer_qty   = stock_monthly_summary.issued_transfer_qty + EXCLUDED.issued_transfer_qty,
        issued_adjustment_qty = stock_monthly_summary.issued_adjustment_qty + EXCLUDED.issued_adjustment_qty,
        issued_wasted_qty     = stock_monthly_summary.issued_wasted_qty + EXCLUDED.issued_wasted_qty,
        total_issued_qty      = stock_monthly_summary.total_issued_qty + EXCLUDED.total_issued_qty,
        net_change_qty         = stock_monthly_summary.net_change_qty + EXCLUDED.net_change_qty,
        transaction_count      = stock_monthly_summary.transaction_count + 1,
        invoice_count          = stock_monthly_summary.invoice_count + EXCLUDED.invoice_count,
        avg_unit_price         = EXCLUDED.avg_unit_price,
        updated_at              = now();

    -- Keep running balances correct even for backdated/out-of-order rows
    PERFORM fn_recompute_monthly_balances(NEW.product_id, NEW.location_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger itself is unchanged (still fires AFTER INSERT on stock_transactions),
-- only the function body was replaced above via CREATE OR REPLACE.

COMMIT;