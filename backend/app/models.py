"""SQLModel schema for DukaPOS."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Staff(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str = ""  # bcrypt hash; required on create
    role: str  # "admin", "cashier", "developer"
    pin_hash: str = ""  # bcrypt hash of 4-6 digit PIN
    is_active: bool = True


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    barcode: str = Field(index=True, unique=True)
    price_buying: float = 0.0
    price_selling: float = 0.0  # VAT-inclusive (retail)
    wholesale_price: Optional[float] = None  # VAT-inclusive
    wholesale_threshold: Optional[int] = None
    tax_percentage: float = Field(default=16.0)
    stock_quantity: int = 0
    min_stock_alert: int = 5


class Shift(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    cashier_id: int = Field(foreign_key="staff.id")
    opening_float: float = 0.0
    closing_actual: Optional[float] = None
    closing_expected: Optional[float] = None


class Customer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    kra_pin: str = ""
    current_balance: float = 0.0
    debt_limit: float = 0.0


class InvoiceSequence(SQLModel, table=True):
    """Single row: next receipt number sequence."""
    id: int | None = Field(default=None, primary_key=True)
    last_number: int = 0


class Receipt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    receipt_id: str = Field(index=True, unique=True) # e.g. POS-01-0001
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    shift_id: Optional[int] = Field(default=None, foreign_key="shift.id")
    staff_id: int = Field(foreign_key="staff.id")
    customer_id: Optional[int] = Field(default=None, foreign_key="customer.id")
    total_amount: float = 0.0
    payment_type: str  # "CASH", "MOBILE", "CREDIT"
    payment_subtype: Optional[str] = None # "M-Pesa", "Bank", "Equity"
    reference_code: Optional[str] = None # Transaction message code
    payment_details_json: Optional[str] = None # JSON string for split payments: [{"method":"CASH","amount":100}, ...]
    is_return: bool = False
    origin_station: str = Field(default="POS-01") # Station ID for conflict resolution
    payment_status: str = "COMPLETED" # COMPLETED, PENDING, FAILED


class SaleItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    receipt_id: int = Field(foreign_key="receipt.id")
    product_id: int = Field(foreign_key="product.id")
    staff_id: int = Field(default=1, foreign_key="staff.id")
    quantity: int
    price_at_moment: float
    is_return: bool = False
    return_reason: Optional[str] = None


class HeldOrder(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    staff_id: int = Field(foreign_key="staff.id")
    items_json: str = "[]"
    total_gross: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StoreSettings(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    shop_name: str = "DukaPOS"
    station_id: str = "POS-01" # Default station ID
    kra_pin: str = ""
    mpesa_till_number: str = ""
    contact_phone: str = ""
    auto_print_receipt: bool = True
    low_stock_warning_enabled: bool = True
    sound_enabled: bool = True
    auto_backup_enabled: bool = True
    staff_limit: int = 5
    master_ip: str = "127.0.0.1"

