"""Store settings API: shop name, KRA PIN, M-Pesa Till, contact. Persisted in DB."""
from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import Session

from app.database import engine
from app.models import StoreSettings

router = APIRouter(prefix="/settings", tags=["settings"])

STORE_SETTINGS_ID = 1


class StoreSettingsRead(BaseModel):
    shop_name: str
    kra_pin: str
    mpesa_till_number: str
    contact_phone: str
    auto_print_receipt: bool = True
    low_stock_warning_enabled: bool = True
    sound_enabled: bool = True
    auto_backup_enabled: bool = True


class StoreSettingsUpdate(BaseModel):
    shop_name: str | None = None
    kra_pin: str | None = None
    mpesa_till_number: str | None = None
    contact_phone: str | None = None
    auto_print_receipt: bool | None = None
    low_stock_warning_enabled: bool | None = None
    sound_enabled: bool | None = None
    auto_backup_enabled: bool | None = None


@router.get("/store", response_model=StoreSettingsRead)
def get_store_settings():
    """Get store settings (for PaymentModal till number, Settings form)."""
    with Session(engine) as session:
        row = session.get(StoreSettings, STORE_SETTINGS_ID)
        if not row:
            return StoreSettingsRead(
                shop_name="DukaPOS",
                kra_pin="",
                mpesa_till_number="",
                contact_phone="",
                auto_print_receipt=True,
                low_stock_warning_enabled=True,
                sound_enabled=True,
                auto_backup_enabled=True,
            )
        return StoreSettingsRead(
            shop_name=row.shop_name or "DukaPOS",
            kra_pin=row.kra_pin or "",
            mpesa_till_number=row.mpesa_till_number or "",
            contact_phone=row.contact_phone or "",
            auto_print_receipt=getattr(row, "auto_print_receipt", True),
            low_stock_warning_enabled=getattr(row, "low_stock_warning_enabled", True),
            sound_enabled=getattr(row, "sound_enabled", True),
            auto_backup_enabled=getattr(row, "auto_backup_enabled", True),
        )


@router.put("/store", response_model=StoreSettingsRead)
def update_store_settings(data: StoreSettingsUpdate):
    """Update store settings (from Admin > Settings)."""
    with Session(engine) as session:
        row = session.get(StoreSettings, STORE_SETTINGS_ID)
        if not row:
            row = StoreSettings(id=STORE_SETTINGS_ID)
            session.add(row)
            session.flush()
        if data.shop_name is not None:
            row.shop_name = data.shop_name
        if data.kra_pin is not None:
            row.kra_pin = data.kra_pin
        if data.mpesa_till_number is not None:
            row.mpesa_till_number = data.mpesa_till_number
        if data.contact_phone is not None:
            row.contact_phone = data.contact_phone
        if data.auto_print_receipt is not None:
            row.auto_print_receipt = data.auto_print_receipt
        if data.low_stock_warning_enabled is not None:
            row.low_stock_warning_enabled = data.low_stock_warning_enabled
        if data.sound_enabled is not None:
            row.sound_enabled = data.sound_enabled
        if data.auto_backup_enabled is not None:
            row.auto_backup_enabled = data.auto_backup_enabled
        session.add(row)
        session.commit()
        session.refresh(row)
        return StoreSettingsRead(
            shop_name=row.shop_name or "DukaPOS",
            kra_pin=row.kra_pin or "",
            mpesa_till_number=row.mpesa_till_number or "",
            contact_phone=row.contact_phone or "",
            auto_print_receipt=getattr(row, "auto_print_receipt", True),
            low_stock_warning_enabled=getattr(row, "low_stock_warning_enabled", True),
            sound_enabled=getattr(row, "sound_enabled", True),
            auto_backup_enabled=getattr(row, "auto_backup_enabled", True),
        )
