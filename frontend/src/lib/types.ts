export interface Product {
  id: string;
  sku: string;
  name: string;
  series: string | null;
  storage_size: number | null; // GB
  color: string | null;
  ram: number | null; // GB
  price: number;
  is_serialized: boolean;
  extra_specs: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  created_by: number | null;
  updated_at: string | null;
  updated_by: number | null;
}

export interface ProductWithStock extends Product {
  location_id: number | null;
  location_name: string | null;
  quantity: number;
}

export interface Location {
  id: number;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface ProductFilters {
  location_ids?: number[];
  name?: string;
  series?: string;
  storage_size?: number;
  min_storage?: number;
  max_storage?: number;
  color?: string;
  ram?: number;
  min_ram?: number;
  max_ram?: number;
  min_price?: number;
  max_price?: number;
}

export interface NewProduct {
  sku: string;
  name: string;
  series?: string;
  storage_size?: number;
  color?: string;
  ram?: number;
  price: number;
  is_serialized: boolean;
}

export interface InvoiceItem {
  id: number;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  received_qty: number;
}

// Invoice status codes — must match config table (category='invoice') on the backend.
export const INVOICE_STATUS = {
  PENDING: 0,
  RECEIVING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
} as const;

export interface Invoice {
  id: number;
  invoice_no: string;
  location_id: number;
  location_name: string | null;
  status: number; // see INVOICE_STATUS
  status_label: string | null; // human-readable, resolved by the backend
  invoice_date: string;
  source_issue_id: number | null;       // set when this invoice exists to receive an incoming transfer
  source_issue_no: string | null;       // the transfer's issue_no, for display
  source_location_name: string | null;  // the transfer's origin location, for display
  created_by: number | null;
  items: InvoiceItem[];
}

export interface NewInvoiceItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface NewInvoice {
  invoice_no: string;
  location_id: number;
  items: NewInvoiceItem[];
}

export interface ReceiveResult {
  invoice_id: number;
  invoice_status: number; // see INVOICE_STATUS
  product_id: string;
  item_received_qty: number;
  item_quantity: number;
  message: string;
}

export interface IssueItemOut {
  id: number;
  product_id: string;
  product_name: string | null;
  serial_number: string | null;
  quantity: number;
  unit_price: number | null;
  received_qty: number; // only meaningful when the parent issue is a transfer (trade_code === 1)
}

// Transfer status codes — must match config table (category='transfer_status') on the backend.
export const TRANSFER_STATUS = {
  IN_TRANSIT: 1,
  RECEIVED: 2,
} as const;

// Trade codes for issues — numeric on the backend (see StockTransactionRow.trade_code below).
// 1: transfer, 55: adjustment, 99: wasted (per RAS spec).
export const TRADE_CODE = {
  TRANSFER: 1,
  ADJUSTMENT: 55,
  WASTE: 99,
} as const;

export interface Issue {
  id: number;
  issue_no: string;
  location_id: number;
  location_name: string | null;
  to_location_id: number | null;
  to_location_name: string | null;
  reason_type: "trade_code" | "trade_description";
  trade_code: number; // see TRADE_CODE
  transfer_status: number | null; // see TRANSFER_STATUS; null unless this is a transfer (trade_code === 1)
  transfer_status_label: string | null; // human-readable, resolved by the backend
  remark: string | null;
  issue_date: string;
  created_by: number | null;
  items: IssueItemOut[];
}

export interface TransferReceiveResult {
  issue_id: number;
  transfer_status: number; // see TRANSFER_STATUS
  transfer_status_label: string | null;
  product_id: string;
  item_received_qty: number;
  item_quantity: number;
  message: string;
}

export interface NewIssueItem {
  product_id: string;
  serial_number?: string;
  quantity?: number;
}

export interface NewIssue {
  issue_no: string;
  location_id: number;
  to_location_id?: number;
  reason_type: "trade_code" | "trade_description";
  trade_code: string;
  remark?: string;
  items: NewIssueItem[];
}

export interface CurrentStockRow {
  product_id: string;
  sku: string;
  name: string;
  series: string | null;
  storage_size: number | null;
  color: string | null;
  is_serialized: boolean;
  location_id: number;
  location_name: string;
  quantity: number;
}

export interface StockTrackingRow {
  location_name: string;
  product_name: string;
  series: string | null;
  storage_size: number | null;
  color: string | null;
  ram: number | null;
  extra_specs: Record<string, unknown> | null;
  control_serial: string | null;
  non_control_amount: number | null;
  status: string;
}

export interface StockTransactionRow {
  id: number;
  trade_type: "RCV" | "ISS";
  trade_code: number;
  product_id: string;
  product_name: string | null;
  location_id: number;
  location_name: string | null;
  serial_number: string | null;
  quantity: number;
  ref_type: string | null;
  ref_id: number | null;
  ref_doc_number: string | null;
  direction: string | null;
  created_by: number | null;
  created_at: string; // ISO timestamp
}

// ---------------- Month-end stock summary ----------------
// Matches StockSummaryRowOut from stock_summary_router.py.
// One row per product+location, for a single closed (frozen) month.
export interface StockSummaryRow {
  product_id: string;
  sku: string;
  product_name: string;
  series: string | null;
  location_id: number;
  location_code: string;
  location_name: string;

  begin_qty: number;
  receive_00_qty: number; // purchase
  receive_01_qty: number; // transfer in
  receive_55_qty: number; // adjust in
  issue_01_qty: number;   // transfer out
  issue_55_qty: number;   // adjust out
  issue_99_qty: number;   // waste
  close_qty: number;
}