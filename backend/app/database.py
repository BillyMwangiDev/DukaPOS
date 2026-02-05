"""Database engine and session for DukaPOS."""
import os
import sys
from sqlmodel import Session, create_engine, SQLModel, select
from app.config import config

from app.models import Staff, Receipt, SaleItem, Shift, InvoiceSequence, StoreSettings

# When run as PyInstaller exe, Electron sets DATABASE_URL to userData/data/pos.db
if getattr(sys, "frozen", False) and os.environ.get("DATABASE_URL"):
    DATABASE_URL = os.environ["DATABASE_URL"]
else:
    DATABASE_URL = config("DATABASE_URL", default="sqlite:///./dukapos.db")
connect_args = {} if not DATABASE_URL.startswith("sqlite") else {"check_same_thread": False}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_to_enterprise_schema()
    _migrate_user_columns()
    _migrate_store_settings_columns()
    _migrate_customer_kra_pin()
    _migrate_product_description()
    _migrate_customer_email_address()
    _migrate_heldorder_notes()
    _migrate_transactionitem_cashier()
    _seed_default_staff()
    _seed_sample_staff()
    _seed_invoice_sequence()
    _seed_store_settings()


def _migrate_to_enterprise_schema() -> None:
    """Migrate data from old User/Transaction tables to Staff/Receipt if needed."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = insp.get_table_names()
        
        # 1. User -> Staff
        if "user" in tables and "staff" in tables:
            staff_count = conn.execute(text("SELECT count(*) FROM staff")).scalar()
            if staff_count == 0:
                conn.execute(text("""
                    INSERT INTO staff (id, username, password_hash, pin_hash, role, is_active)
                    SELECT id, username, password_hash, pin_hash, role, is_active FROM user
                """))
                conn.commit()

        # 2. Transaction -> Receipt
        if "transaction" in tables and "receipt" in tables:
            receipt_count = conn.execute(text("SELECT count(*) FROM receipt")).scalar()
            if receipt_count == 0:
                # Helper to generate receipt_id if missing
                conn.execute(text("""
                    INSERT INTO receipt (id, receipt_id, timestamp, shift_id, staff_id, customer_id, 
                                        total_amount, payment_type, is_return, origin_station, payment_status)
                    SELECT id, 'MIG-' || id, timestamp, shift_id, cashier_id, customer_id, 
                           total_amount, payment_method, is_return, 'POS-01', payment_status FROM [transaction]
                """))
                conn.commit()

        # 3. TransactionItem -> SaleItem
        if "transactionitem" in tables and "saleitem" in tables:
            item_count = conn.execute(text("SELECT count(*) FROM saleitem")).scalar()
            if item_count == 0:
                conn.execute(text("""
                    INSERT INTO saleitem (id, receipt_id, product_id, staff_id, quantity, price_at_moment, is_return, return_reason)
                    SELECT id, transaction_id, product_id, cashier_id, quantity, price_at_moment, is_return, return_reason FROM transactionitem
                """))
                conn.commit()


def _migrate_user_columns() -> None:
    """Add password_hash, is_active to staff table if missing."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "staff" not in insp.get_table_names():
            return
        cols = [c["name"] for c in insp.get_columns("staff")]
        if "password_hash" not in cols:
            conn.execute(text("ALTER TABLE staff ADD COLUMN password_hash TEXT DEFAULT ''"))
        if "is_active" not in cols:
            conn.execute(text("ALTER TABLE staff ADD COLUMN is_active INTEGER DEFAULT 1"))
        conn.commit()


def _seed_default_staff() -> None:
    """Ensure at least one admin exists in Staff."""
    from app.auth_utils import hash_password, hash_pin
    with Session(engine) as session:
        has_any = session.exec(select(Staff)).first() is not None
        has_admin = session.exec(select(Staff).where(Staff.role == "admin")).first() is not None
        if not has_any:
            session.add(Staff(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
                pin_hash=hash_pin("0000"),
                is_active=True,
            ))
            session.commit()
        elif not has_admin:
            session.add(Staff(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
                pin_hash=hash_pin("0000"),
                is_active=True,
            ))
            session.commit()


# Sample users for testing login
_SAMPLE_STAFF = [
    {"username": "cashier", "password": "cashier123", "pin": "1234", "role": "cashier"},
    {"username": "jane", "password": "jane123", "pin": "5678", "role": "cashier"},
]


def _seed_sample_staff() -> None:
    """Add sample cashier staff if they do not exist."""
    from app.auth_utils import hash_password, hash_pin
    with Session(engine) as session:
        for sample in _SAMPLE_STAFF:
            existing = session.exec(select(Staff).where(Staff.username == sample["username"])).first()
            if existing:
                continue
            session.add(Staff(
                username=sample["username"],
                password_hash=hash_password(sample["password"]),
                role=sample["role"],
                pin_hash=hash_pin(sample["pin"]),
                is_active=True,
            ))
        session.commit()


def _seed_invoice_sequence() -> None:
    """Ensure one row in InvoiceSequence."""
    with Session(engine) as session:
        if session.exec(select(InvoiceSequence)).first() is None:
            session.add(InvoiceSequence(last_number=0))
            session.commit()


def _migrate_store_settings_columns() -> None:
    """Add new columns like station_id to storesettings."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = [t.lower() for t in insp.get_table_names()]
        if "storesettings" not in tables:
            return
        table_name = "storesettings"
        try:
            cols = [c["name"].lower() for c in insp.get_columns(table_name)]
        except Exception:
            return
        
        updates = [
            ("auto_print_receipt", "1"),
            ("low_stock_warning_enabled", "1"),
            ("sound_enabled", "1"),
            ("auto_backup_enabled", "1"),
            ("station_id", "'POS-01'"),
            ("staff_limit", "5"),
            ("master_ip", "'127.0.0.1'"),
        ]
        
        for col, default in updates:
            if col not in cols:
                try:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} INTEGER DEFAULT {default}"))
                except Exception:
                    # might be TEXT for station_id or master_ip
                    try:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} TEXT DEFAULT {default}"))
                    except Exception:
                        pass
        conn.commit()


def _migrate_customer_kra_pin() -> None:
    """Add kra_pin to customer table if missing."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "customer" not in insp.get_table_names():
            return
        cols = [c["name"].lower() for c in insp.get_columns("customer")]
        if "kra_pin" not in cols:
            conn.execute(text("ALTER TABLE customer ADD COLUMN kra_pin TEXT DEFAULT ''"))
        conn.commit()


def _migrate_product_description() -> None:
    """Add description to product table if missing."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "product" not in insp.get_table_names():
            return
        cols = [c["name"].lower() for c in insp.get_columns("product")]
        if "description" not in cols:
            conn.execute(text("ALTER TABLE product ADD COLUMN description TEXT"))
        conn.commit()


def _migrate_customer_email_address() -> None:
    """Add email and address to customer table."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "customer" not in insp.get_table_names():
            return
        cols = [c["name"].lower() for c in insp.get_columns("customer")]
        for col in ("email", "address"):
            if col not in cols:
                conn.execute(text(f"ALTER TABLE customer ADD COLUMN {col} TEXT"))
        conn.commit()


def _migrate_heldorder_notes() -> None:
    """Add notes to heldorder table."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "heldorder" not in insp.get_table_names():
            return
        cols = [c["name"].lower() for c in insp.get_columns("heldorder")]
        if "notes" not in cols:
            conn.execute(text("ALTER TABLE heldorder ADD COLUMN notes TEXT DEFAULT ''"))
        conn.commit()


def _migrate_transactionitem_cashier() -> None:
    """Add cashier accountability columns."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "saleitem" in insp.get_table_names():
            cols = [c["name"].lower() for c in insp.get_columns("saleitem")]
            if "staff_id" not in cols:
                conn.execute(text("ALTER TABLE saleitem ADD COLUMN staff_id INTEGER DEFAULT 1"))
        conn.commit()


def _seed_store_settings() -> None:
    """Ensure row in StoreSettings (id=1)."""
    with Session(engine) as session:
        if session.get(StoreSettings, 1) is None:
            session.add(StoreSettings(
                id=1,
                shop_name="DukaPOS",
                station_id="POS-01",
                kra_pin="",
                mpesa_till_number="",
                contact_phone="",
                auto_print_receipt=True,
                low_stock_warning_enabled=True,
                sound_enabled=True,
                auto_backup_enabled=True,
            ))
            session.commit()


def get_next_receipt_id() -> str:
    """Generate next receipt ID with Station ID prefix (e.g. POS-01-00001)."""
    with Session(engine) as session:
        settings = session.get(StoreSettings, 1)
        prefix = settings.station_id if settings else "POS-01"
        
        row = session.exec(select(InvoiceSequence)).first()
        if not row:
            session.add(InvoiceSequence(last_number=1))
            session.commit()
            return f"{prefix}-00001"
        
        next_num = row.last_number + 1
        row.last_number = next_num
        session.add(row)
        session.commit()
        return f"{prefix}-{next_num:05d}"


def get_session():
    with Session(engine) as session:
        yield session

