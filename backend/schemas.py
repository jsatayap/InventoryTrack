import uuid
from datetime import datetime, date
from typing import Literal

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str | None
    role: str
    location_id: int | None
    is_active: bool

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


# ---------------- Products ----------------

class ProductBase(BaseModel):
    sku: str
    name: str
    series: str | None = None
    storage_size: int | None = None  # GB
    color: str | None = None
    ram: int | None = None  # GB
    price: float
    is_serialized: bool = True
    extra_specs: dict | None = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    sku: str | None = None
    name: str | None = None
    series: str | None = None
    storage_size: int | None = None
    color: str | None = None
    ram: int | None = None
    price: float | None = None
    is_serialized: bool | None = None
    extra_specs: dict | None = None
    is_active: bool | None = None


class ProductOut(ProductBase):
    id: uuid.UUID
    created_at: datetime
    created_by: int | None = None
    updated_at: datetime | None = None
    updated_by: int | None = None

    class Config:
        from_attributes = True


class ProductStockOut(ProductOut):
    """Product with stock quantity at a specific location (used for location search)."""
    location_id: int | None = None
    location_name: str | None = None
    quantity: int | None = None


# ---------------- Locations ----------------

class LocationBase(BaseModel):
    code: str
    name: str
    address: str | None = None
    is_active: bool = True


class LocationCreate(LocationBase):
    pass


class LocationUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    address: str | None = None
    is_active: bool | None = None


class LocationOut(LocationBase):
    id: int

    class Config:
        from_attributes = True


# ---------------- Invoices ----------------

class InvoiceItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int
    unit_price: float


class InvoiceItemOut(BaseModel):
    id: int
    product_id: uuid.UUID
    product_name: str | None = None
    quantity: int
    unit_price: float
    received_qty: int

    class Config:
        from_attributes = True


class InvoiceCreate(BaseModel):
    invoice_no: str
    location_id: int
    invoice_date: str | None = None  # ISO date string, defaults to today in DB
    items: list[InvoiceItemCreate]

class InvoiceItemUpdate(BaseModel):
    id: int | None = None  # existing item id; omit/None for a newly added line
    product_id: uuid.UUID
    quantity: int
    unit_price: float


class InvoiceUpdate(BaseModel):
    invoice_no: str | None = None
    location_id: int | None = None
    status: int | None = None  # see config: category='invoice'
    items: list[InvoiceItemUpdate] | None = None

class InvoiceOut(BaseModel):
    id: int
    invoice_no: str
    location_id: int
    location_name: str | None = None
    status: int  # see config: category='invoice'
    status_label: str | None = None  # e.g. "pending" — resolved from config
    invoice_date: str
    source_issue_id: int | None = None       # set when this invoice exists to receive an incoming transfer
    source_issue_no: str | None = None        # NEW — the transfer's issue_no, for display
    source_location_name: str | None = None   # NEW — the transfer's origin location, for display
    created_by: int | None = None
    items: list[InvoiceItemOut] = []

    class Config:
        from_attributes = True


# ---------------- Receive ----------------

class ReceiveSerialRequest(BaseModel):
    product_id: uuid.UUID
    serial_number: str


class ReceiveQuantityRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int


class ReceiveResultOut(BaseModel):
    invoice_id: int
    invoice_status: int  # see config: category='invoice'
    invoice_status_label: str | None = None  # e.g. "receiving" — resolved from config
    product_id: uuid.UUID
    item_received_qty: int
    item_quantity: int
    message: str


# ---------------- Issues (สินค้าออก) ----------------

class IssueItemCreate(BaseModel):
    product_id: uuid.UUID
    serial_number: str | None = None  # required for serialized products
    quantity: int | None = None       # required for non-serialized products


class IssueItemOut(BaseModel):
    id: int
    product_id: uuid.UUID
    product_name: str | None = None
    serial_number: str | None = None
    quantity: int
    unit_price: float | None = None
    received_qty: int = 0  # only meaningful when the parent issue is a transfer (trade_code == 1)

    class Config:
        from_attributes = True


class IssueCreate(BaseModel):
    issue_no: str
    location_id: int
    to_location_id: int | None = None  # required when trade_code == 1 (transfer)
    trade_code: int   # 1 transfer, 55 adjust, 99 wasted; see config: category='issue'
    remark: str | None = None
    items: list[IssueItemCreate]


class IssueOut(BaseModel):
    id: int
    issue_no: str
    location_id: int
    location_name: str | None = None
    to_location_id: int | None = None
    to_location_name: str | None = None
    trade_code: int
    trade_code_label: str | None = None  # e.g. "transfer" — resolved from config
    transfer_status: int | None = None  # see config: category='transfer_status'; null unless trade_code == 1
    transfer_status_label: str | None = None  # e.g. "in_transit" / "received"
    remark: str | None = None
    issue_date: str
    created_by: int | None = None
    items: list[IssueItemOut] = []

    class Config:
        from_attributes = True


# ---------------- Transfer receiving (destination confirmation) ----------------

class TransferReceiveSerialRequest(BaseModel):
    serial_number: str


class TransferReceiveQuantityRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int


class TransferReceiveResultOut(BaseModel):
    issue_id: int
    transfer_status: int  # see config: category='transfer_status'
    transfer_status_label: str | None = None
    product_id: uuid.UUID
    item_received_qty: int
    item_quantity: int
    message: str


# ---------------- Stock (read-only views) ----------------

class CurrentStockOut(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    series: str | None = None
    storage_size: int | None = None
    color: str | None = None
    is_serialized: bool
    location_id: int
    location_name: str
    quantity: int


class StockTrackingOut(BaseModel):
    location_name: str
    product_name: str
    series: str | None = None
    storage_size: int | None = None
    color: str | None = None
    ram: int | None = None
    extra_specs: dict | None = None
    control_serial: str | None = None
    non_control_amount: int | None = None
    status: str


class StockTransactionOut(BaseModel):
    id: int
    trade_type: str  # 'RCV' | 'ISS'
    trade_code: int
    product_id: uuid.UUID
    product_name: str | None = None
    location_id: int
    location_name: str | None = None
    serial_number: str | None = None
    quantity: int
    ref_type: str | None = None
    ref_id: int | None = None
    ref_doc_number: str | None = None
    direction: str | None = None
    created_by: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class MonthlyStockTrendOut(BaseModel):
    month: str        # "2026-01"
    received: int
    issued: int

class TradeCodeOut(BaseModel):
    id: int
    trade_type: str          # 'RCV' | 'ISS'
    code: int
    column_name: str         # e.g. "iss_01" -- the key used in `quantities`
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True

    class Config:
        from_attributes = True


class TradeCodeCreate(BaseModel):
    trade_type: Literal["RCV", "ISS"]
    code: int = Field(ge=0, le=999)
    description: str | None = None


class StockMonthlySummaryOut(BaseModel):
    id: int | None = None        # None for the live (not yet closed) month
    month: date
    product_id: uuid.UUID
    location_id: int | None = None

    sku: str | None = None
    product_name: str | None = None
    series: str | None = None
    is_serialized: bool
    location_code: str | None = None
    location_name: str | None = None

    opening_balance: int
    received_qty: int            # all RCV codes
    total_issued_qty: int        # all ISS codes
    net_change_qty: int
    closing_balance: int

    avg_unit_price: float | None = None
    received_value: float | None = None
    issued_value: float | None = None

    invoice_count: int
    transaction_count: int
    closed_at: datetime | None = None   # None for the live month
    is_closed: bool = False             # False = computed live (month not closed yet)

    # Per-trade-code quantities keyed by trade_codes.column_name,
    # e.g. {"rcv_00": 5, "iss_01": 2, "iss_55": 0, "iss_99": 1}
    quantities: dict[str, int] = {}

    class Config:
        from_attributes = True


class MonthlySummaryListOut(BaseModel):
    columns: list[TradeCodeOut]           # header order for the `quantities` keys
    total: int                            # rows matching the filters, before skip/limit
    rows: list[StockMonthlySummaryOut]


class PeriodStatusOut(BaseModel):
    closed_months: list[date]
    next_month_to_close: date | None = None
    can_close_next: bool = False


class CloseMonthRequest(BaseModel):
    month: date


class CloseMonthResult(BaseModel):
    month: date
    rows_written: int


# ---------------- Low-stock alerts ----------------

class StockThresholdBase(BaseModel):
    product_id: uuid.UUID
    location_id: int
    reorder_point: int


class StockThresholdCreate(StockThresholdBase):
    """Creating a threshold for a (product_id, location_id) pair that already has
    one is treated as an upsert by the route -- it updates reorder_point in place
    rather than erroring on the unique constraint."""
    pass


class StockThresholdUpdate(BaseModel):
    reorder_point: int


class StockThresholdOut(StockThresholdBase):
    id: int
    sku: str | None = None
    product_name: str | None = None
    location_name: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class LowStockAlertOut(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    series: str | None = None
    is_serialized: bool
    location_id: int
    location_name: str
    quantity: int
    reorder_point: int
    shortage: int  # reorder_point - quantity; always >= 0 for rows in this list
    incoming_qty: int
    effective_stock: int
    alert_category: str  # "critical" | "on_order"