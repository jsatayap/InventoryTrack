from sqlalchemy import (
    Column, Integer, String, Boolean, Numeric, Text, Date, DateTime,
    ForeignKey, func, UniqueConstraint, Computed
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from database import Base
from uuid7 import uuid7


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100))
    role = Column(String(20), nullable=False, default="staff")
    location_id = Column(Integer, ForeignKey("locations.id"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    location = relationship("Location")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    address = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    sku = Column(String(50), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    series = Column(String(100))
    storage_size = Column(Integer)  # GB, e.g. 256 — lets us filter/sort by range
    color = Column(String(50))
    ram = Column(Integer)  # GB, e.g. 8 — lets us filter/sort by range
    price = Column(Numeric(12, 2), nullable=False, default=0)
    is_serialized = Column(Boolean, nullable=False, default=True)
    extra_specs = Column(JSONB)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"))


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_no = Column(String(50), unique=True, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    status = Column(Integer, nullable=False, default=0)  # see config: category='invoice'
    invoice_date = Column(Date, nullable=False, server_default=func.current_date())
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    location = relationship("Location")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    received_qty = Column(Integer, nullable=False, default=0)

    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product")


class ProductUnit(Base):
    __tablename__ = "products_actual"

    id = Column(Integer, primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    serial_number = Column(String(100), unique=True, nullable=False)
    status = Column(Integer, nullable=False, default=1)  # see config: category='product_unit_status'
    current_location_id = Column(Integer, ForeignKey("locations.id"))
    invoice_item_id = Column(Integer, ForeignKey("invoice_items.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"))

    product = relationship("Product")
    location = relationship("Location")


class StockBalance(Base):
    __tablename__ = "stock_balances"

    id = Column(Integer, primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)


class StockThreshold(Base):
    __tablename__ = "stock_thresholds"

    id = Column(Integer, primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    reorder_point = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"))

    __table_args__ = (
        UniqueConstraint("product_id", "location_id", name="uq_stock_threshold_grain"),
    )

    product = relationship("Product")
    location = relationship("Location")


class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True)
    issue_no = Column(String(50), unique=True, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    to_location_id = Column(Integer, ForeignKey("locations.id"))  # destination, only for trade_code 1 (transfer)
    trade_code = Column(Integer, nullable=False)  # see config: category='issue'
    remark = Column(Text)
    issue_date = Column(Date, nullable=False, server_default=func.current_date())
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("IssueItem", back_populates="issue", cascade="all, delete-orphan")
    location = relationship("Location", foreign_keys=[location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])


class IssueItem(Base):
    __tablename__ = "issue_items"

    id = Column(Integer, primary_key=True)
    issue_id = Column(Integer, ForeignKey("issues.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    product_unit_id = Column(Integer, ForeignKey("products_actual.id"))
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2))

    issue = relationship("Issue", back_populates="items")
    product = relationship("Product")
    product_unit = relationship("ProductUnit")


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id = Column(Integer, primary_key=True)
    trade_type = Column(String(3), nullable=False)  # 'RCV' | 'ISS'
    trade_code = Column(Integer, nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    serial_number = Column(String(100))
    quantity = Column(Integer, nullable=False, default=1)
    ref_type = Column(String(20))
    ref_id = Column(Integer)
    ref_doc_number = Column(String(50))
    direction = Column(String(3))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class StockMonthlySummary(Base):
    __tablename__ = "stock_monthly_summary"

    id = Column(Integer, primary_key=True)

    # Grain
    month = Column(Date, nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)

    # Denormalized descriptive fields
    sku = Column(String(50))
    product_name = Column(String(150))
    series = Column(String(100))
    is_serialized = Column(Boolean, nullable=False, default=True)
    location_code = Column(String(20))
    location_name = Column(String(100))

    # Transaction measures
    received_qty = Column(Integer, nullable=False, default=0)
    issued_qty = Column(Integer, nullable=False, default=0)  # original total, kept for backward compat
    opening_balance = Column(Integer, nullable=False, default=0)
    issued_transfer_qty = Column(Integer, nullable=False, default=0)     # trade_code 1
    issued_adjustment_qty = Column(Integer, nullable=False, default=0)   # trade_code 55
    issued_wasted_qty = Column(Integer, nullable=False, default=0)       # trade_code 99
    total_issued_qty = Column(Integer, nullable=False, default=0)
    net_change_qty = Column(Integer, nullable=False, default=0)
    closing_balance = Column(Integer, nullable=False, default=0)

    # Value fields — generated columns, DB-computed, read-only in the ORM
    avg_unit_price = Column(Numeric(12, 2))
    received_value = Column(Numeric(14, 2), Computed("received_qty * COALESCE(avg_unit_price, 0)", persisted=True))
    issued_value = Column(Numeric(14, 2), Computed("total_issued_qty * COALESCE(avg_unit_price, 0)", persisted=True))

    # Traceability (approximate — see migration notes on invoice_count)
    invoice_count = Column(Integer, nullable=False, default=0)
    transaction_count = Column(Integer, nullable=False, default=0)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("month", "product_id", "location_id", name="uq_monthly_summary_grain"),
    )

    product = relationship("Product")
    location = relationship("Location")

class StockQuarterlySummary(Base):
    __tablename__ = "stock_quarterly_summary"

    id = Column(Integer, primary_key=True)

    # Grain
    quarter = Column(Date, nullable=False)  # first day of quarter, e.g. 2026-01-01
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)

    # Denormalized descriptive fields (same as monthly)
    sku = Column(String(50))
    product_name = Column(String(150))
    series = Column(String(100))
    is_serialized = Column(Boolean, nullable=False, default=True)
    location_code = Column(String(20))
    location_name = Column(String(100))

    # Rolled-up measures (summed from stock_monthly_summary, except opening/closing)
    received_qty = Column(Integer, nullable=False, default=0)
    opening_balance = Column(Integer, nullable=False, default=0)   # first month in quarter
    issued_transfer_qty = Column(Integer, nullable=False, default=0)
    issued_adjustment_qty = Column(Integer, nullable=False, default=0)
    issued_wasted_qty = Column(Integer, nullable=False, default=0)
    total_issued_qty = Column(Integer, nullable=False, default=0)
    net_change_qty = Column(Integer, nullable=False, default=0)
    closing_balance = Column(Integer, nullable=False, default=0)   # last month in quarter

    # Value fields — plain sums of the monthly generated columns, not re-derived here
    avg_unit_price = Column(Numeric(12, 2))  # weighted: SUM(received_value) / SUM(received_qty)
    received_value = Column(Numeric(14, 2))
    issued_value = Column(Numeric(14, 2))

    # Traceability (approximate, inherited from monthly)
    invoice_count = Column(Integer, nullable=False, default=0)
    transaction_count = Column(Integer, nullable=False, default=0)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("quarter", "product_id", "location_id", name="uq_quarterly_summary_grain"),
    )

    product = relationship("Product")
    location = relationship("Location")


class Config(Base):
    __tablename__ = "config"

    id = Column(Integer, primary_key=True)
    category = Column(String(50), nullable=False)
    key = Column(Integer, nullable=False)
    value = Column(String(100), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"))