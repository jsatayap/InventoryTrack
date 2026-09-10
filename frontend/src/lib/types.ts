export interface Product {
  id: number;
  sku: string;
  name: string;
  series: string | null;
  storage_size: string | null;
  color: string | null;
  ram: string | null;
  price: number;
  is_serialized: boolean;
  extra_specs: Record<string, unknown> | null;
  is_active: boolean;
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
  location_id?: number;
  name?: string;
  series?: string;
  storage_size?: string;
  color?: string;
  ram?: string;
  min_price?: number;
  max_price?: number;
}

export interface NewProduct {
  sku: string;
  name: string;
  series?: string;
  storage_size?: string;
  color?: string;
  ram?: string;
  price: number;
  is_serialized: boolean;
}

export interface InvoiceItem {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  received_qty: number;
}

export interface Invoice {
  id: number;
  invoice_no: string;
  location_id: number;
  location_name: string | null;
  status: "pending" | "receiving" | "completed" | "cancelled";
  invoice_date: string;
  created_by: number | null;
  items: InvoiceItem[];
}

export interface NewInvoiceItem {
  product_id: number;
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
  invoice_status: string;
  product_id: number;
  item_received_qty: number;
  item_quantity: number;
  message: string;
}

export interface IssueItemOut {
  id: number;
  product_id: number;
  product_name: string | null;
  serial_number: string | null;
  quantity: number;
  unit_price: number | null;
}

export interface Issue {
  id: number;
  issue_no: string;
  location_id: number;
  location_name: string | null;
  to_location_id: number | null;
  to_location_name: string | null;
  reason_type: "trade_code" | "trade_description";
  trade_code: string;
  remark: string | null;
  issue_date: string;
  created_by: number | null;
  items: IssueItemOut[];
}

export interface NewIssueItem {
  product_id: number;
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
  product_id: number;
  sku: string;
  name: string;
  series: string | null;
  storage_size: string | null;
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
  storage_size: string | null;
  color: string | null;
  ram: string | null;
  extra_specs: Record<string, unknown> | null;
  control_serial: string | null;
  non_control_amount: number | null;
  status: string;
}