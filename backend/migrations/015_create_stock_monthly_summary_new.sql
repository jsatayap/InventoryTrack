BEGIN;

-- ============================================================
-- 009: Closed-month stock summary with dynamic trade-code columns.
--
--   trade_codes            config: which RCV/ISS codes exist (drives columns)
--   stock_monthly_summary  one row per (month, product, location), one
--                          integer column per registered trade code
--   closed_periods         months that are closed (rows become immutable)
--   add_trade_code()       registers a code AND adds its column, atomically
--   fn_close_month()       the ONLY writer of stock_monthly_summary
-- ============================================================

-- 1. Config table ---------------------------------------------------------
CREATE TABLE trade_codes (
    id          SERIAL PRIMARY KEY,
    trade_type  VARCHAR(3) NOT NULL CHECK (trade_type IN ('RCV', 'ISS')),
    code        INTEGER    NOT NULL CHECK (code BETWEEN 0 AND 999),
    -- e.g. ISS + 1 -> 'iss_01', RCV + 0 -> 'rcv_00'
    column_name TEXT GENERATED ALWAYS AS
                (lower(trade_type) || '_' || lpad(code::text, 2, '0')) STORED,
    description TEXT,
    sort_order  INTEGER    NOT NULL DEFAULT 0,
    is_active   BOOLEAN    NOT NULL DEFAULT true,  -- deactivate, never delete
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_trade_codes UNIQUE (trade_type, code),
    CONSTRAINT uq_trade_codes_column UNIQUE (column_name)
);

-- 2. Summary table (fixed columns only; code columns are added below) -----
CREATE TABLE stock_monthly_summary (
    id SERIAL PRIMARY KEY,

    -- Grain
    month       DATE    NOT NULL CHECK (month = date_trunc('month', month)::date),
    product_id  UUID    NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),

    -- Descriptive fields, frozen at close time
    sku           VARCHAR(50),
    product_name  VARCHAR(150),
    series        VARCHAR(100),
    is_serialized BOOLEAN NOT NULL DEFAULT true,
    location_code VARCHAR(20),
    location_name VARCHAR(100),

    -- Totals (written once by fn_close_month)
    opening_balance   INTEGER NOT NULL DEFAULT 0,
    received_qty      INTEGER NOT NULL DEFAULT 0,  -- all RCV codes
    total_issued_qty  INTEGER NOT NULL DEFAULT 0,  -- all ISS codes
    net_change_qty    INTEGER NOT NULL DEFAULT 0,
    closing_balance   INTEGER NOT NULL DEFAULT 0,

    -- Value fields
    avg_unit_price NUMERIC(12,2),
    received_value NUMERIC(14,2) GENERATED ALWAYS AS (received_qty * COALESCE(avg_unit_price, 0)) STORED,
    issued_value   NUMERIC(14,2) GENERATED ALWAYS AS (total_issued_qty * COALESCE(avg_unit_price, 0)) STORED,

    -- Traceability
    invoice_count     INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,

    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_monthly_summary_grain UNIQUE (month, product_id, location_id)
);

CREATE INDEX ix_stock_monthly_summary_location_month
    ON stock_monthly_summary (location_id, month);

-- 3. Closed months --------------------------------------------------------
CREATE TABLE closed_periods (
    month     DATE PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
    closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by INTEGER REFERENCES users(id)
);

-- 4. add_trade_code(): register a code and add its column, atomically -----
--    SELECT add_trade_code('RCV', 77, 'Consignment');
CREATE OR REPLACE FUNCTION add_trade_code(
    p_type TEXT, p_code INTEGER, p_description TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
    v_col TEXT;
BEGIN
    INSERT INTO trade_codes (trade_type, code, description)
    VALUES (upper(p_type), p_code, p_description)
    RETURNING column_name INTO v_col;

    -- %I quotes the identifier safely. Constant default = no table rewrite,
    -- and ADD COLUMN does not touch existing (closed) rows.
    EXECUTE format(
        'ALTER TABLE stock_monthly_summary ADD COLUMN IF NOT EXISTS %I integer NOT NULL DEFAULT 0',
        v_col);

    RETURN v_col;
END;
$$ LANGUAGE plpgsql;

-- 5. Seed trade_codes and create their columns ----------------------------
--    ISS codes come from config (category='issue'); anything else comes
--    from the codes actually present in stock_transactions.
INSERT INTO trade_codes (trade_type, code, description)
SELECT 'ISS', c.key, c.value
FROM config c
WHERE c.category = 'issue'
ON CONFLICT (trade_type, code) DO NOTHING;

INSERT INTO trade_codes (trade_type, code)
SELECT DISTINCT trade_type, trade_code
FROM stock_transactions
WHERE trade_type IN ('RCV', 'ISS')
ON CONFLICT (trade_type, code) DO NOTHING;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT column_name FROM trade_codes ORDER BY trade_type DESC, code LOOP
        EXECUTE format(
            'ALTER TABLE stock_monthly_summary ADD COLUMN IF NOT EXISTS %I integer NOT NULL DEFAULT 0',
            r.column_name);
    END LOOP;
END $$;

-- 6. fn_close_month(): builds ONE dynamic INSERT ... SELECT ---------------
--    SELECT fn_close_month('2026-08-01');   -- returns rows written
CREATE OR REPLACE FUNCTION fn_close_month(p_month DATE) RETURNS INTEGER AS $$
DECLARE
    v_tz     CONSTANT TEXT := 'Asia/Bangkok';   -- month boundaries in store-local time
    v_start  TIMESTAMPTZ := p_month::timestamp AT TIME ZONE v_tz;
    v_end    TIMESTAMPTZ := (p_month + interval '1 month')::timestamp AT TIME ZONE v_tz;
    v_last   DATE;
    v_unreg  TEXT;
    r        RECORD;
    i        INTEGER := 0;
    v_cols   TEXT := '';   -- target column names, e.g. , "rcv_00", "iss_01"
    v_inner  TEXT := '';   -- per-code SUMs
    v_outer  TEXT := '';   -- per-code pass-through
    v_rows   INTEGER;
BEGIN
    IF p_month <> date_trunc('month', p_month)::date THEN
        RAISE EXCEPTION 'p_month must be the first day of a month, got %', p_month;
    END IF;

    IF p_month >= date_trunc('month', now() AT TIME ZONE v_tz)::date THEN
        RAISE EXCEPTION 'Month % is not finished yet and cannot be closed', p_month;
    END IF;

    IF EXISTS (SELECT 1 FROM closed_periods WHERE month = p_month) THEN
        RAISE EXCEPTION 'Month % is already closed', p_month;
    END IF;

    -- Close in order: no gaps between closed months
    SELECT max(month) INTO v_last FROM closed_periods;
    IF v_last IS NOT NULL AND p_month <> (v_last + interval '1 month')::date THEN
        RAISE EXCEPTION 'Close months in order: next month to close is %',
            (v_last + interval '1 month')::date;
    END IF;

    -- Every code used this month must be registered (otherwise totals would
    -- not equal the sum of the per-code columns)
    SELECT string_agg(DISTINCT t.trade_type || '/' || t.trade_code, ', ')
    INTO v_unreg
    FROM stock_transactions t
    WHERE t.created_at >= v_start AND t.created_at < v_end
      AND NOT EXISTS (SELECT 1 FROM trade_codes c
                      WHERE c.trade_type = t.trade_type AND c.code = t.trade_code);
    IF v_unreg IS NOT NULL THEN
        RAISE EXCEPTION 'Unregistered trade codes in %: %. Run add_trade_code() first.',
            p_month, v_unreg;
    END IF;

    -- The dynamic part: one column + one SUM per registered code
    FOR r IN SELECT column_name, trade_type, code
             FROM trade_codes ORDER BY sort_order, trade_type DESC, code
    LOOP
        v_cols  := v_cols  || ', ' || quote_ident(r.column_name);
        v_inner := v_inner || format(
            ', COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= $1 AND t.trade_type = %L AND t.trade_code = %s), 0)::integer AS c%s',
            r.trade_type, r.code, i);
        v_outer := v_outer || format(', a.c%s', i);
        i := i + 1;
    END LOOP;

    EXECUTE format($sql$
        INSERT INTO stock_monthly_summary (
            month, product_id, location_id,
            sku, product_name, series, is_serialized, location_code, location_name,
            opening_balance, received_qty, total_issued_qty, net_change_qty, closing_balance,
            avg_unit_price, invoice_count, transaction_count%s)
        SELECT
            $3, a.product_id, a.location_id,
            p.sku, p.name, p.series, p.is_serialized, l.code, l.name,
            a.opening, a.rcv, a.iss, a.rcv - a.iss, a.opening + a.rcv - a.iss,
            p.price, a.inv_cnt, a.txn_cnt%s
        FROM (
            SELECT
                t.product_id, t.location_id,
                COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at <  $1 AND t.trade_type = 'RCV'), 0)::integer
              - COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at <  $1 AND t.trade_type = 'ISS'), 0)::integer AS opening,
                COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= $1 AND t.trade_type = 'RCV'), 0)::integer AS rcv,
                COALESCE(SUM(t.quantity) FILTER (WHERE t.created_at >= $1 AND t.trade_type = 'ISS'), 0)::integer AS iss,
                (COUNT(*) FILTER (WHERE t.created_at >= $1))::integer AS txn_cnt,
                (COUNT(DISTINCT t.ref_id) FILTER (WHERE t.created_at >= $1 AND t.trade_type = 'RCV' AND t.ref_type = 'invoice'))::integer AS inv_cnt
                %s
            FROM stock_transactions t
            WHERE t.created_at < $2
            GROUP BY t.product_id, t.location_id
        ) a
        JOIN products  p ON p.id = a.product_id
        JOIN locations l ON l.id = a.location_id
        WHERE a.opening <> 0 OR a.txn_cnt > 0
    $sql$, v_cols, v_outer, v_inner)
    USING v_start, v_end, p_month;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- Last step: once this row exists, the guard trigger locks the month
    INSERT INTO closed_periods (month) VALUES (p_month);

    RETURN v_rows;
END;
$$ LANGUAGE plpgsql;

-- 7. Guards (installed last so they don't get in the way of the setup) ----
CREATE OR REPLACE FUNCTION fn_block_closed_month() RETURNS trigger AS $$
DECLARE
    v_month DATE;
BEGIN
    IF TG_OP = 'INSERT' THEN v_month := NEW.month; ELSE v_month := OLD.month; END IF;

    IF EXISTS (SELECT 1 FROM closed_periods WHERE month = v_month) THEN
        RAISE EXCEPTION 'Month % is closed; stock_monthly_summary rows cannot be changed', v_month;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.month <> OLD.month
       AND EXISTS (SELECT 1 FROM closed_periods WHERE month = NEW.month) THEN
        RAISE EXCEPTION 'Month % is closed; rows cannot be moved into it', NEW.month;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_closed_month
BEFORE INSERT OR UPDATE OR DELETE ON stock_monthly_summary
FOR EACH ROW EXECUTE FUNCTION fn_block_closed_month();

CREATE OR REPLACE FUNCTION fn_block_summary_truncate() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM closed_periods) THEN
        RAISE EXCEPTION 'stock_monthly_summary has closed months and cannot be truncated';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_summary_truncate
BEFORE TRUNCATE ON stock_monthly_summary
FOR EACH STATEMENT EXECUTE FUNCTION fn_block_summary_truncate();

CREATE OR REPLACE FUNCTION fn_block_reopen() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Closed periods cannot be changed or reopened';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_reopen
BEFORE UPDATE OR DELETE ON closed_periods
FOR EACH ROW EXECUTE FUNCTION fn_block_reopen();

COMMIT;