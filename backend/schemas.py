import uuid
from datetime import datetime

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
    quantity: int = 0


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

class InvoiceUpdate(BaseModel):
    invoice_no: str | None = None
    location_id: int | None = None
    status: str | None = None

class InvoiceOut(BaseModel):
    id: int
    invoice_no: str
    location_id: int
    location_name: str | None = None
    status: str
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
    invoice_status: str
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
    to_location_id: int | None = None  # required when trade_code == '01' (transfer)
    reason_type: str  # 'trade_code' | 'trade_description'
    trade_code: str   # '01' transfer, '55' adjust, '99' wasted
    remark: str | None = None
    items: list[IssueItemCreate]


class IssueOut(BaseModel):
    id: int
    issue_no: str
    location_id: int
    location_name: str | None = None
    to_location_id: int | None = None
    to_location_name: str | None = None
    reason_type: str
    trade_code: str
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