CREATE TABLE stock_quarterly_summary (
    id SERIAL PRIMARY KEY,

    quarter DATE NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),

    sku VARCHAR(50),
    product_name VARCHAR(150),
    series VARCHAR(100),
    is_serialized BOOLEAN NOT NULL DEFAULT true,
    location_code VARCHAR(20),
    location_name VARCHAR(100),

    received_qty INTEGER NOT NULL DEFAULT 0,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    issued_transfer_qty INTEGER NOT NULL DEFAULT 0,
    issued_adjustment_qty INTEGER NOT NULL DEFAULT 0,
    issued_wasted_qty INTEGER NOT NULL DEFAULT 0,
    total_issued_qty INTEGER NOT NULL DEFAULT 0,
    net_change_qty INTEGER NOT NULL DEFAULT 0,
    closing_balance INTEGER NOT NULL DEFAULT 0,

    avg_unit_price NUMERIC(12, 2),
    received_value NUMERIC(14, 2),
    issued_value NUMERIC(14, 2),

    invoice_count INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_quarterly_summary_grain UNIQUE (quarter, product_id, location_id)
);