BEGIN;

-- Safety guard: 008 must only ever run BEFORE 009. Once 009 has run,
-- stock_monthly_summary is the NEW table (possibly with closed months),
-- and dropping it here would destroy them.
DO $$
BEGIN
    IF to_regclass('trade_codes') IS NOT NULL THEN
        RAISE EXCEPTION '008 already superseded: trade_codes exists, so 009 has run. Refusing to drop stock_monthly_summary.';
    END IF;
END $$;

-- ============================================================
-- 008: Drop the old live-updated summary design (006 + 007).
--   * live trigger + helper functions on stock_transactions
--   * stock_quarterly_summary (dropped for now; rebuild later)
--   * stock_monthly_summary
-- No CASCADE on purpose: if a view or FK still depends on these
-- tables, this fails loudly instead of silently dropping it.
-- stock_transactions itself is NOT touched.
-- ============================================================

DROP TRIGGER  IF EXISTS trg_stock_transactions_summary ON stock_transactions;
DROP FUNCTION IF EXISTS fn_bump_monthly_summary();
DROP FUNCTION IF EXISTS fn_recompute_monthly_balances(UUID, INTEGER);

DROP TABLE IF EXISTS stock_quarterly_summary;
DROP TABLE IF EXISTS stock_monthly_summary;

COMMIT;