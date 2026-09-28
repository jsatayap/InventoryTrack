BEGIN;

-- ============================================================
-- 010: Close every finished month that has transactions, oldest first.
-- ONE-WAY: closed months can't be edited afterwards. Run only after the
-- rules in fn_close_month (avg_unit_price, invoice_count) are confirmed.
-- The current (unfinished) month is intentionally left open.
-- ============================================================
DO $$
DECLARE
    v_tz    CONSTANT TEXT := 'Asia/Bangkok';
    v_m     DATE;
    v_limit DATE := date_trunc('month', now() AT TIME ZONE v_tz)::date;
BEGIN
    SELECT date_trunc('month', min(created_at) AT TIME ZONE v_tz)::date
    INTO v_m FROM stock_transactions;

    IF v_m IS NULL THEN RETURN; END IF;

    WHILE v_m < v_limit LOOP
        PERFORM fn_close_month(v_m);
        v_m := (v_m + interval '1 month')::date;
    END LOOP;
END $$;

COMMIT;