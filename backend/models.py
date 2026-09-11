from sqlalchemy import (
    Column, Integer, String, Boolean, Numeric, Text, Date, DateTime,
    ForeignKey, func
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
    status = Column(String(20), nullable=False, default="pending")
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
    __tablename__ = "product_units"

    id = Column(Integer, primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    serial_number = Column(String(100), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default="in_stock")
    current_location_id = Column(Integer, ForeignKey("locations.id"))
    invoice_item_id = Column(Integer, ForeignKey("invoice_items.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product")
    location = relationship("Location")


class StockBalance(Base):
    __tablename__ = "stock_balances"

    id = Column(Integer, primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)


class Issue(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True)
    issue_no = Column(String(50), unique=True, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    to_location_id = Column(Integer, ForeignKey("locations.id"))  # destination, only for trade_code '01'
    reason_type = Column(String(20), nullable=False)  # 'trade_code' | 'trade_description'
    trade_code = Column(String(2), nullable=False)
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
    product_unit_id = Column(Integer, ForeignKey("product_units.id"))
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2))

    issue = relationship("Issue", back_populates="items")
    product = relationship("Product")
    product_unit = relationship("ProductUnit")


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id = Column(Integer, primary_key=True)
    trade_type = Column(String(3), nullable=False)  # 'RCV' | 'ISS'
    trade_code = Column(String(2), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    serial_number = Column(String(100))
    quantity = Column(Integer, nullable=False, default=1)
    ref_type = Column(String(20))
    ref_id = Column(Integer)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())