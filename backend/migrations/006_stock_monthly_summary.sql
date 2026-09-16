BEGIN;

-- 1. Create the table
CREATE TABLE stock_monthly_summary (
    id SERIAL PRIMARY KEY,
    month DATE NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    received_qty INTEGER NOT NULL DEFAULT 0,
    issued_qty INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_monthly_summary_grain UNIQUE (month, product_id, location_id)
);

CREATE INDEX ix_stock_monthly_summary_month ON stock_monthly_summary (month);

-- 2. Backfill from existing stock_transactions (must run BEFORE the trigger exists,
--    so existing rows aren't double-counted)
INSERT INTO stock_monthly_summary (month, product_id, location_id, received_qty, issued_qty)
SELECT
    date_trunc('month', created_at)::date,
    product_id,
    location_id,
    SUM(CASE WHEN trade_type = 'RCV' THEN quantity ELSE 0 END),
    SUM(CASE WHEN trade_type = 'ISS' THEN quantity ELSE 0 END)
FROM stock_transactions
GROUP BY 1, 2, 3
ON CONFLICT (month, product_id, location_id) DO NOTHING;

-- 3. Trigger function + trigger, to keep the summary in sync going forward
CREATE OR REPLACE FUNCTION fn_bump_monthly_summary() RETURNS trigger AS $$
BEGIN
  INSERT INTO stock_monthly_summary (month, product_id, location_id, received_qty, issued_qty)
  VALUES (
    date_trunc('month', NEW.created_at)::date,
    NEW.product_id,
    NEW.location_id,
    CASE WHEN NEW.trade_type = 'RCV' THEN NEW.quantity ELSE 0 END,
    CASE WHEN NEW.trade_type = 'ISS' THEN NEW.quantity ELSE 0 END
  )
  ON CONFLICT (month, product_id, location_id) DO UPDATE SET
    received_qty = stock_monthly_summary.received_qty + EXCLUDED.received_qty,
    issued_qty = stock_monthly_summary.issued_qty + EXCLUDED.issued_qty,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_transactions_summary
AFTER INSERT ON stock_transactions
FOR EACH ROW EXECUTE FUNCTION fn_bump_monthly_summary();

COMMIT;