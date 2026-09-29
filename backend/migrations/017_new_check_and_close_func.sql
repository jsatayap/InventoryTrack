-- 016_check_and_close_previous_month.sql
BEGIN;

-- The old version points at the old summary tables, so remove it first.
DROP FUNCTION IF EXISTS check_and_close_previous_month();

CREATE FUNCTION check_and_close_previous_month() RETURNS TEXT AS $$
DECLARE
    v_tz         CONSTANT TEXT := 'Asia/Bangkok';
    v_this_month DATE := date_trunc('month', now() AT TIME ZONE v_tz)::date;
    v_next       DATE;
    v_rows       INTEGER;
    v_msg        TEXT := '';
BEGIN
    -- Stop two runs from happening at the same time
    IF NOT pg_try_advisory_xact_lock(hashtext('close_monthly_summary')) THEN
        RETURN 'skipped: another run in progress';
    END IF;

    -- Next month to close = the month after the last closed one
    SELECT (max(month) + interval '1 month')::date INTO v_next FROM closed_periods;

    -- Nothing closed yet: start from the first month that has transactions
    IF v_next IS NULL THEN
        SELECT date_trunc('month', min(created_at) AT TIME ZONE v_tz)::date
        INTO v_next
        FROM stock_transactions;
    END IF;

    IF v_next IS NULL THEN
        RETURN 'nothing to close: no transactions yet';
    END IF;

    -- Close every finished month, oldest first
    WHILE v_next < v_this_month LOOP
        v_rows := fn_close_month(v_next);
        v_msg  := v_msg || format('closed %s (%s rows); ', v_next, v_rows);
        v_next := (v_next + interval '1 month')::date;
    END LOOP;

    IF v_msg = '' THEN
        RETURN 'nothing to close';
    END IF;
    RETURN v_msg;
END;
$$ LANGUAGE plpgsql;

COMMIT;