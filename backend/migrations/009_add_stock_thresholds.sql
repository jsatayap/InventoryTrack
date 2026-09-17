-- Rename this file with the next sequential number in your migrations/
-- directory (following the existing 001_..., 007_... convention) before
-- running it.
--
-- Run with:
--   psql "$DATABASE_URL" -f migrations/<NNN>_add_stock_thresholds.sql

BEGIN;

CREATE TABLE IF NOT EXISTS stock_thresholds (
    id             SERIAL PRIMARY KEY,
    product_id     UUID NOT NULL REFERENCES products(id),
    location_id    INTEGER NOT NULL REFERENCES locations(id),
    reorder_point  INTEGER NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     INTEGER REFERENCES users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by     INTEGER REFERENCES users(id),

    CONSTRAINT uq_stock_threshold_grain UNIQUE (product_id, location_id)
);

-- Speeds up the joins in list_thresholds / get_low_stock_alerts.
CREATE INDEX IF NOT EXISTS idx_stock_thresholds_location ON stock_thresholds(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_thresholds_product  ON stock_thresholds(product_id);

COMMIT;

-- Note: updated_at is refreshed by SQLAlchemy's onupdate=func.now() on the
-- ORM side (models.StockThreshold), not by a DB trigger -- consistent with
-- how the rest of the schema avoids per-row triggers.