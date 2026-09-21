-- Run this once, manually, against your database.
-- Creates the control table that tracks which months have been
-- closed into their own stock_summary_<year>_<month> table.
--
-- This does not touch any existing tables (stock_transactions,
-- stock_monthly_summary, etc.) -- it's a brand new table.

CREATE TABLE stock_summary_control (
    id SERIAL PRIMARY KEY,
    year_month DATE NOT NULL UNIQUE,             -- always the 1st of the month, e.g. 2026-08-01
    table_name VARCHAR(50) NOT NULL,             -- e.g. 'stock_summary_2026_08'
    status VARCHAR(10) NOT NULL DEFAULT 'open',  -- 'open' or 'closed'
    closed_at TIMESTAMPTZ                        -- filled in when we freeze it
);