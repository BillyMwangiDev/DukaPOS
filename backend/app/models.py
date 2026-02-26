"""SQLModel schema for DukaPOS."""
from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy.orm import relationship as sa_rel


class Staff(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str = ""  # bcrypt hash; required on create
    role: str  # "admin", "cashier", "developer"
    pin_hash: str = ""  # bcrypt hash of 4-6 digit PIN
    is_active: bool = True


class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    barcode: str = Field(index=True, unique=True)
    category: str = Field(default="General")
    price_buying: float = 0.0
    price_selling: float = 0.0  # VAT-inclusive (retail)
    wholesale_price: Optional[float] = None  # VAT-inclusive
    wholesale_threshold: Optional[int] = None
    tax_percentage: float = Field(default=16.0)
    stock_quantity: int = 0
    min_stock_alert: int = 5
    image_url: Optional[str] = None
    item_discount_type: Optional[str] = None  # "percent", "fixed", or null
    item_discount_value: Optional[float] = None
    item_discount_start: Optional[datetime] = None   # campaign start (inclusive)
    item_discount_expiry: Optional[datetime] = None  # campaign end (inclusive, end-of-day)


class Shift(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    cashier_id: int = Field(foreign_key="staff.id")
    opening_float: float = 0.0
    closing_actual: Optional[float] = None
    closing_expected: Optional[float] = None


class Customer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    kra_pin: str = ""
    current_balance: float = 0.0
    debt_limit: float = 0.0
    points_balance: int = 0
    lifetime_points: int = 0


class InvoiceSequence(SQLModel, table=True):
    """Single row: next receipt number sequence."""
    id: Optional[int] = Field(default=None, primary_key=True)
    last_number: int = 0


class SaleItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    receipt_id: int = Field(foreign_key="receipt.id")
    product_id: int = Field(foreign_key="product.id")
    staff_id: int = Field(default=1, foreign_key="staff.id")
    quantity: int
    price_at_moment: float
    is_return: bool = False
    return_reason: Optional[str] = None

    # Use sa_relationship to bypass SQLModel's broken annotation parsing
    # with from __future__ import annotations
    receipt: Optional[Receipt] = Relationship(
        sa_relationship=sa_rel("Receipt", back_populates="items")
    )


class Receipt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    receipt_id: str = Field(index=True, unique=True)  # e.g. POS-01-0001
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    shift_id: Optional[int] = Field(default=None, foreign_key="shift.id")
    staff_id: int = Field(foreign_key="staff.id")
    customer_id: Optional[int] = Field(default=None, foreign_key="customer.id")
    total_amount: float = 0.0
    payment_type: str  # "CASH", "MOBILE", "BANK", "CREDIT", "SPLIT"
    payment_subtype: Optional[str] = None  # "M-Pesa", "Bank Transfer", "Equity", "KCB", "Absa", "Visa/Card"
    reference_code: Optional[str] = None  # Transaction message code
    checkout_request_id: Optional[str] = Field(default=None, index=True)
    mpesa_code: Optional[str] = None
    payment_details_json: Optional[str] = None  # JSON string for split payments
    is_return: bool = False
    origin_station: str = Field(default="POS-01")  # Station ID for conflict resolution
    payment_status: str = "COMPLETED"  # COMPLETED, PENDING, FAILED
    business_name: str = "DukaPOS"  # Snapshot of business name at time of sale

    # Discount applied at checkout
    discount_amount: float = 0.0

    # Bank-specific fields
    bank_name: Optional[str] = None
    bank_sender_name: Optional[str] = None
    bank_confirmed: bool = False
    bank_confirmation_timestamp: Optional[datetime] = None

    # Use sa_relationship to bypass SQLModel's broken annotation parsing
    items: List[SaleItem] = Relationship(
        sa_relationship=sa_rel("SaleItem", back_populates="receipt")
    )


class HeldOrder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    staff_id: int = Field(foreign_key="staff.id")
    items_json: str = "[]"
    total_gross: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StoreSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    shop_name: str = "DukaPOS"
    station_id: str = "POS-01"  # Default station ID
    kra_pin: str = ""
    mpesa_till_number: str = ""
    contact_phone: str = ""
    auto_print_receipt: bool = True
    low_stock_warning_enabled: bool = True
    sound_enabled: bool = True
    auto_backup_enabled: bool = True
    staff_limit: int = 5
    master_ip: str = "127.0.0.1"
    receipt_header: str = ""
    receipt_footer: str = "Thank you for shopping with us!"
    vat_rate: float = 16.0


class PriceOverrideLog(SQLModel, table=True):
    """Audit trail for admin-authorized price overrides on cart items."""
    id: Optional[int] = Field(default=None, primary_key=True)
    cashier_id: Optional[int] = Field(default=None, foreign_key="staff.id")
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    new_price: float
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())


class StockAdjustment(SQLModel, table=True):
    """Audit trail for inventory quantity changes (damage, theft, expired, correction, etc.)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id")
    staff_id: Optional[int] = Field(default=None, foreign_key="staff.id")
    quantity_change: int  # positive = add, negative = remove
    reason: str  # "Damage", "Expired", "Theft", "Received", "Correction"
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())


class Discount(SQLModel, table=True):
    """Reusable discount definitions (percent or fixed amount)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    discount_type: str  # "percent" or "fixed"
    value: float  # percent: 0-100; fixed: KSh amount
    scope: str = "order"  # "order" or "item"
    is_active: bool = True
    code: Optional[str] = None  # optional promo code
    start_date: Optional[datetime] = None  # validity window start (inclusive)
    end_date: Optional[datetime] = None    # validity window end (inclusive)


class Supplier(SQLModel, table=True):
    """Product suppliers for purchase order management."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class PurchaseOrder(SQLModel, table=True):
    """Purchase order from a supplier to restock inventory."""
    id: Optional[int] = Field(default=None, primary_key=True)
    supplier_id: int = Field(foreign_key="supplier.id")
    staff_id: Optional[int] = Field(default=None, foreign_key="staff.id")
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    status: str = "pending"  # "pending" or "received"
    total_cost: float = 0.0
    notes: str = ""


class PurchaseOrderItem(SQLModel, table=True):
    """Individual line item on a purchase order."""
    id: Optional[int] = Field(default=None, primary_key=True)
    po_id: int = Field(foreign_key="purchaseorder.id")
    product_id: int = Field(foreign_key="product.id")
    qty_ordered: int = 0
    qty_received: int = 0
    unit_cost: float = 0.0
