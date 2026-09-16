import uuid
from datetime import datetime, date

from pydantic import BaseModel


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
    remark: str | None = None
    issue_date: str
    created_by: int | None = None
    items: list[IssueItemOut] = []

    class Config:
        from_attributes = True


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

class StockMonthlySummaryOut(BaseModel):
    id: int
    month: date
    product_id: uuid.UUID
    location_id: int

    sku: str | None = None
    product_name: str | None = None
    series: str | None = None
    is_serialized: bool
    location_code: str | None = None
    location_name: str | None = None

    received_qty: int
    issued_qty: int
    opening_balance: int
    issued_transfer_qty: int
    issued_adjustment_qty: int
    issued_wasted_qty: int
    total_issued_qty: int
    net_change_qty: int
    closing_balance: int

    avg_unit_price: float | None = None
    received_value: float | None = None
    issued_value: float | None = None

    invoice_count: int
    transaction_count: int
    updated_at: datetime | None = None

    class Config:
        from_attributes = True