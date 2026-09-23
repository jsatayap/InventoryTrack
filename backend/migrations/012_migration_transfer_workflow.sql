-- Adds the two columns the transfer-receiving workflow needs, plus the
-- config rows for the new transfer_status category.

ALTER TABLE issues ADD COLUMN IF NOT EXISTS transfer_status INTEGER;
ALTER TABLE issue_items ADD COLUMN IF NOT EXISTS received_qty INTEGER NOT NULL DEFAULT 0;

INSERT INTO config (category, key, value, description) VALUES
  ('transfer_status', 1, 'in_transit', 'Sent from origin, not yet confirmed at destination'),
  ('transfer_status', 2, 'received', 'Confirmed received at destination')
ON CONFLICT DO NOTHING;

-- products_actual.status has a composite FK against config(category, key)
-- (see the FK constraint products_actual_status_fkey), so the new
-- PRODUCT_UNIT_IN_TRANSIT status code must also exist as a config row, not
-- just as a Python constant in status_codes.py. Adjust the key below (4) if
-- you picked a different unused integer for PRODUCT_UNIT_IN_TRANSIT.
INSERT INTO config (category, key, value, description) VALUES
  ('product_unit_status', 4, 'in_transit', 'Unit has left the origin location as part of a transfer, not yet confirmed at destination')
ON CONFLICT DO NOTHING;