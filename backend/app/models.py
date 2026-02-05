"""SQLModel schema for DukaPOS."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str
    password_hash: str = ""  # bcrypt hash; required on create
    role: str  # "admin" or "cashier"
    pin_hash: str = ""  # bcrypt hash of 4-6 digit PIN
    is_active: bool = True


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None  # optional for TestSprite / API compatibility
    barcode: str = Field(index=True, unique=True)
    price_buying: float = 0.0
    price_selling: float = 0.0  # VAT-inclusive (retail)
    wholesale_price: Optional[float] = None  # VAT-inclusive; used when qty >= wholesale_threshold
    wholesale_threshold: Optional[int] = None  # min qty for wholesale price
    tax_percentage: float = Field(default=16.0)
    stock_quantity: int = 0
    min_stock_alert: int = 5


class Shift(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    cashier_id: int = Field(foreign_key="user.id")
    opening_float: float = 0.0
    closing_actual: Optional[float] = None
    closing_expected: Optional[float] = None  # computed from transactions


class Customer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None  # optional for API/test compatibility
    address: Optional[str] = None  # optional for API/test compatibility
    kra_pin: str = ""  # KRA PIN for eTIMS CSV (Customer_PIN)
    current_balance: float = 0.0  # positive = owes shop
    debt_limit: float = 0.0  # max allowed debt


class InvoiceSequence(SQLModel, table=True):
    """Single row: next invoice number for local Invoice_ID when eTIMS disabled."""
    id: int | None = Field(default=None, primary_key=True)
    last_number: int = 0


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    shift_id: Optional[int] = Field(default=None, foreign_key="shift.id")
    cashier_id: int = Field(foreign_key="user.id")
    customer_id: Optional[int] = Field(default=None, foreign_key="customer.id")  # for credit
    payment_method: str  # "CASH", "MPESA", "CREDIT"
    mpesa_code: Optional[str] = None
    checkout_request_id: Optional[str] = None  # M-Pesa STK CheckoutRequestID for pending
    payment_status: str = "COMPLETED"  # COMPLETED, PENDING, FAILED
    invoice_number: Optional[str] = None  # local Invoice_ID sequence when eTIMS disabled
    total_amount: float = 0.0
    is_return: bool = False


class TransactionItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    transaction_id: int = Field(foreign_key="transaction.id")
    product_id: int = Field(foreign_key="product.id")
    cashier_id: int = Field(default=1, foreign_key="user.id")  # Tracks who sold/edited this item
    quantity: int
    price_at_moment: float
    is_return: bool = False  # Track if this is a returned item
    return_reason: Optional[str] = None  # Reason for return if applicable


class HeldOrder(SQLModel, table=True):
    """Saved cart (hold order) per cashier. items_json: list of {productId,name,barcode,quantity,priceGross,priceWholesale,wholesaleThreshold}."""
    id: int | None = Field(default=None, primary_key=True)
    cashier_id: int = Field(foreign_key="user.id")
    items_json: str = "[]"  # JSON array of cart items
    total_gross: float = 0.0
    notes: str = ""  # optional notes for hold (API/test compatibility)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StoreSettings(SQLModel, table=True):
    """Single row: shop name, KRA PIN, M-Pesa Till, contact, general toggles. id=1."""
    id: int | None = Field(default=None, primary_key=True)
    shop_name: str = "DukaPOS"
    kra_pin: str = ""
    mpesa_till_number: str = ""
    contact_phone: str = ""
    auto_print_receipt: bool = True
    low_stock_warning_enabled: bool = True
    sound_enabled: bool = True
    auto_backup_enabled: bool = True
