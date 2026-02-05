"""Database engine and session for DukaPOS."""
import os
import sys
from sqlmodel import Session, create_engine, SQLModel, select
from app.config import config

from app.models import User, InvoiceSequence, StoreSettings

# When run as PyInstaller exe, Electron sets DATABASE_URL to userData/data/pos.db
if getattr(sys, "frozen", False) and os.environ.get("DATABASE_URL"):
    DATABASE_URL = os.environ["DATABASE_URL"]
else:
    DATABASE_URL = config("DATABASE_URL", default="sqlite:///./dukapos.db")
connect_args = {} if not DATABASE_URL.startswith("sqlite") else {"check_same_thread": False}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_user_columns()
    _migrate_store_settings_columns()
    _migrate_customer_kra_pin()
    _migrate_product_description()
    _migrate_customer_email_address()
    _migrate_heldorder_notes()
    _migrate_transactionitem_cashier()
    _seed_default_user()
    _seed_sample_users()
    _seed_invoice_sequence()
    _seed_store_settings()


def _migrate_user_columns() -> None:
    """Add password_hash, is_active to user table if missing (Phase 1)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "user" not in insp.get_table_names():
            return
        cols = [c["name"] for c in insp.get_columns("user")]
        if "password_hash" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN password_hash TEXT DEFAULT ''"))
        if "is_active" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN is_active INTEGER DEFAULT 1"))
        conn.commit()


def _seed_default_user() -> None:
    """Ensure at least one user and one admin exist (Phase 1)."""
    from app.auth_utils import hash_password, hash_pin
    with Session(engine) as session:
        has_any = session.exec(select(User)).first() is not None
        has_admin = session.exec(select(User).where(User.role == "admin")).first() is not None
        if not has_any:
            session.add(User(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
                pin_hash=hash_pin("0000"),
                is_active=True,
            ))
            session.commit()
        elif not has_admin:
            session.add(User(
                username="admin",
                password_hash=hash_password("admin123"),
                role="admin",
                pin_hash=hash_pin("0000"),
                is_active=True,
            ))
            session.commit()


# Sample users for testing login (see docs/SAMPLE_USERS.md or README).
_SAMPLE_USERS = [
    {"username": "cashier", "password": "cashier123", "pin": "1234", "role": "cashier"},
    {"username": "jane", "password": "jane123", "pin": "5678", "role": "cashier"},
]


def _seed_sample_users() -> None:
    """Add sample cashier users for testing if they do not exist."""
    from app.auth_utils import hash_password, hash_pin
    with Session(engine) as session:
        for sample in _SAMPLE_USERS:
            existing = session.exec(select(User).where(User.username == sample["username"])).first()
            if existing:
                continue
            session.add(User(
                username=sample["username"],
                password_hash=hash_password(sample["password"]),
                role=sample["role"],
                pin_hash=hash_pin(sample["pin"]),
                is_active=True,
            ))
        session.commit()


def _seed_invoice_sequence() -> None:
    """Ensure one row in InvoiceSequence for local Invoice_ID."""
    with Session(engine) as session:
        if session.exec(select(InvoiceSequence)).first() is None:
            session.add(InvoiceSequence(last_number=0))
            session.commit()


def _migrate_store_settings_columns() -> None:
    """Add Phase 2 boolean columns to storesettings table if missing."""
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
        for col, default in [
            ("auto_print_receipt", "1"),
            ("low_stock_warning_enabled", "1"),
            ("sound_enabled", "1"),
            ("auto_backup_enabled", "1"),
        ]:
            if col not in cols:
                try:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} INTEGER DEFAULT {default}"))
                except Exception:
                    pass
        conn.commit()


def _migrate_customer_kra_pin() -> None:
    """Add kra_pin to customer table if missing (eTIMS Customer_PIN)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = [t.lower() for t in insp.get_table_names()]
        if "customer" not in tables:
            return
        try:
            cols = [c["name"].lower() for c in insp.get_columns("customer")]
        except Exception:
            return
        if "kra_pin" not in cols:
            try:
                conn.execute(text("ALTER TABLE customer ADD COLUMN kra_pin TEXT DEFAULT ''"))
            except Exception:
                pass
        conn.commit()


def _migrate_product_description() -> None:
    """Add description to product table if missing (API/test compatibility)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        if "product" not in insp.get_table_names():
            return
        try:
            cols = [c["name"].lower() for c in insp.get_columns("product")]
        except Exception:
            return
        if "description" not in cols:
            try:
                conn.execute(text("ALTER TABLE product ADD COLUMN description TEXT"))
            except Exception:
                pass
        conn.commit()


def _migrate_customer_email_address() -> None:
    """Add email and address to customer table if missing (API/test compatibility)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = [t.lower() for t in insp.get_table_names()]
        if "customer" not in tables:
            return
        try:
            cols = [c["name"].lower() for c in insp.get_columns("customer")]
        except Exception:
            return
        for col in ("email", "address"):
            if col not in cols:
                try:
                    conn.execute(text(f"ALTER TABLE customer ADD COLUMN {col} TEXT"))
                except Exception:
                    pass
        conn.commit()


def _migrate_heldorder_notes() -> None:
    """Add notes to heldorder table if missing (API/test compatibility)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = [t.lower() for t in insp.get_table_names()]
        if "heldorder" not in tables:
            return
        try:
            cols = [c["name"].lower() for c in insp.get_columns("heldorder")]
        except Exception:
            return
        if "notes" not in cols:
            try:
                conn.execute(text("ALTER TABLE heldorder ADD COLUMN notes TEXT DEFAULT ''"))
            except Exception:
                pass
        conn.commit()


def _migrate_transactionitem_cashier() -> None:
    """Add cashier accountability columns to transactionitem table."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        tables = [t.lower() for t in insp.get_table_names()]
        if "transactionitem" not in tables:
            return
        try:
            cols = [c["name"].lower() for c in insp.get_columns("transactionitem")]
        except Exception:
            return
        # Add cashier_id for accountability
        if "cashier_id" not in cols:
            try:
                conn.execute(text("ALTER TABLE transactionitem ADD COLUMN cashier_id INTEGER DEFAULT 1"))
            except Exception:
                pass
        # Add is_return flag for tracking returned items
        if "is_return" not in cols:
            try:
                conn.execute(text("ALTER TABLE transactionitem ADD COLUMN is_return INTEGER DEFAULT 0"))
            except Exception:
                pass
        # Add return_reason for audit trail
        if "return_reason" not in cols:
            try:
                conn.execute(text("ALTER TABLE transactionitem ADD COLUMN return_reason TEXT"))
            except Exception:
                pass
        conn.commit()


def _seed_store_settings() -> None:
    """Ensure one row in StoreSettings (id=1)."""
    with Session(engine) as session:
        if session.get(StoreSettings, 1) is None:
            session.add(StoreSettings(
                id=1,
                shop_name="DukaPOS",
                kra_pin="",
                mpesa_till_number="",
                contact_phone="",
                auto_print_receipt=True,
                low_stock_warning_enabled=True,
                sound_enabled=True,
                auto_backup_enabled=True,
            ))
            session.commit()


def get_next_invoice_number() -> str:
    """Get next local Invoice_ID (e.g. INV-00001). Thread-safe within same process."""
    with Session(engine) as session:
        row = session.exec(select(InvoiceSequence)).first()
        if not row:
            session.add(InvoiceSequence(last_number=1))
            session.flush()
            session.commit()
            return "INV-00001"
        next_num = row.last_number + 1
        row.last_number = next_num
        session.add(row)
        session.commit()
        return f"INV-{next_num:05d}"


def get_session():
    with Session(engine) as session:
        yield session
