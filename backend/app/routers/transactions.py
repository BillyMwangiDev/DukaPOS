"""Transactions API: persist sale/return on payment complete."""
import json
import traceback
import urllib.request
from datetime import datetime
from typing import List, Optional

from app.config import config
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlmodel import Session

from app.database import engine, get_next_receipt_id
from app.models import Receipt, SaleItem, Staff, Customer, Product
from sqlalchemy.orm import selectinload
from sqlmodel import select
from app.routers.tax_export import build_vscu_payload_for_transaction
from app.websocket_manager import broadcast_sync, create_event, EventType
from pydantic import Field

router = APIRouter(prefix="/transactions", tags=["transactions"])

from app.routers.print_router import _do_print_receipt  # noqa: E402
import logging  # noqa: E402
logger = logging.getLogger("dukapos.transactions")


class SaleItemPayload(BaseModel):
    product_id: int = Field(alias="productId")
    quantity: int
    price_at_moment: float

    class Config:
        populate_by_name = True


class ReceiptCreate(BaseModel):
    staff_id: int = 1
    shift_id: Optional[int] = None
    customer_id: Optional[int] = None
    payment_type: str  # "CASH", "MOBILE", "CREDIT", or "SPLIT"
    payment_subtype: Optional[str] = None  # "M-Pesa", "Bank", etc.
    reference_code: Optional[str] = None  # Trans code for bank/m-pesa
    payment_details_json: Optional[str] = None  # Serialized split info
    checkout_request_id: Optional[str] = None
    payment_status: str = "COMPLETED"
    origin_station: str = "POS-01"
    items: List[SaleItemPayload]
    total_amount: float
    discount_amount: float = 0.0
    is_return: bool = False
    use_local_invoice: bool = True
    # Bank-specific fields
    bank_name: Optional[str] = None
    bank_sender_name: Optional[str] = None
    bank_confirmed: bool = False
    bank_confirmation_timestamp: Optional[datetime] = None


class SaleItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    price_at_moment: float
    name: Optional[str] = None

    # price and total properties for backward compat
    @property
    def price(self) -> float:
        return self.price_at_moment

    @property
    def total(self) -> float:
        return self.quantity * self.price_at_moment

    # Pydantic v1 compat
    class Config:
        orm_mode = True
        from_attributes = True  # v2 compat
        allow_population_by_field_name = True

    # Override dict/model_dump to include properties
    def dict(self, *args, **kwargs):
        d = super().dict(*args, **kwargs)
        d["price"] = self.price_at_moment
        d["total"] = self.quantity * self.price_at_moment
        return d

    def model_dump(self, *args, **kwargs):
        # v2 uses model_dump, but we provide it for safety
        if hasattr(super(), "model_dump"):
            d = super().model_dump(*args, **kwargs)
        else:
            d = self.dict(*args, **kwargs)
        d["price"] = self.price_at_moment
        d["total"] = self.quantity * self.price_at_moment
        return d


class ReceiptRead(BaseModel):
    id: int
    receipt_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    payment_type: Optional[str] = "CASH"
    payment_subtype: Optional[str] = None
    reference_code: Optional[str] = None
    total_amount: float = 0.0
    is_return: bool = False
    # Bank-specific fields
    bank_name: Optional[str] = None
    bank_sender_name: Optional[str] = None
    bank_confirmed: bool = False
    items: List[SaleItemRead] = []

    class Config:
        orm_mode = True
        from_attributes = True


@router.get("")
def list_transactions(
    skip: int = 0,
    limit: int = 50,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """List past transactions with items."""
    try:
        from sqlmodel import select
        from sqlalchemy.orm import selectinload

        with Session(engine) as session:
            stmt = select(Receipt).options(selectinload(Receipt.items)).order_by(Receipt.timestamp.desc()).offset(skip).limit(limit)

            if start_date:
                try:
                    start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                    stmt = stmt.where(Receipt.timestamp >= start)
                except ValueError:
                    pass
            if end_date:
                try:
                    end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                    end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
                    stmt = stmt.where(Receipt.timestamp <= end)
                except ValueError:
                    pass

            results = session.exec(stmt).all()

            # Convert to dicts for safe serialization
            output = []
            for r in results:
                r_dict = {
                    "id": r.id,
                    "receipt_id": r.receipt_id,
                    "business_name": r.business_name,
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                    "payment_type": r.payment_type,
                    "payment_subtype": r.payment_subtype,
                    "reference_code": r.reference_code,
                    "bank_name": r.bank_name,
                    "bank_sender_name": r.bank_sender_name,
                    "bank_confirmed": r.bank_confirmed,
                    "total_amount": r.total_amount,
                    "is_return": r.is_return,
                    "items": []
                }

                for it in r.items:
                    product = session.get(Product, it.product_id)
                    it_dict = {
                        "id": it.id,
                        "product_id": it.product_id,
                        "quantity": it.quantity,
                        "price_at_moment": it.price_at_moment,
                        "name": product.name if product else f"Item #{it.product_id}",
                        "price": it.price_at_moment,
                        "total": it.quantity * it.price_at_moment
                    }
                    r_dict["items"].append(it_dict)

                output.append(r_dict)

            return output
    except Exception as e:
        logger.error(f"Error in list_transactions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("", response_model=ReceiptRead, status_code=201)
def create_receipt(data: ReceiptCreate, background_tasks: BackgroundTasks):
    """Persist receipt and sale items."""
    try:
        logger.info(f"Incoming receipt: staff_id={data.staff_id}, total={data.total_amount}, payment_type={data.payment_type}, items={len(data.items or [])}")
        p_type = (data.payment_type or "").upper()

        # Financial sanity checks
        if data.total_amount < 0:
            raise HTTPException(status_code=400, detail="total_amount cannot be negative")
        if data.discount_amount < 0:
            raise HTTPException(status_code=400, detail="discount_amount cannot be negative")
        if data.discount_amount > data.total_amount:
            raise HTTPException(status_code=400, detail="discount_amount cannot exceed total_amount")
        for it in data.items:
            if it.price_at_moment < 0:
                raise HTTPException(status_code=400, detail=f"price_at_moment cannot be negative (product_id={it.product_id})")
        if not data.items:
            raise HTTPException(status_code=400, detail="Receipt must contain at least one item")

        # Validation for Credit
        if p_type == "CREDIT" and not data.customer_id:
            logger.error(f"customer_id missing for CREDIT payment. Staff ID: {data.staff_id}")
            raise HTTPException(status_code=400, detail="customer_id required for CREDIT payment")

        # Validation for Bank
        if p_type == "BANK":
            if not data.bank_name:
                raise HTTPException(status_code=400, detail="bank_name required for BANK payment")
            if not data.bank_confirmed:
                raise HTTPException(status_code=400, detail="Bank payment must be confirmed by cashier")
            # Duplicate reference code detection — prevent the same bank ref being recorded twice
            if data.reference_code and data.reference_code.strip():
                with Session(engine) as _dup_session:
                    existing = _dup_session.exec(
                        select(Receipt)
                        .where(Receipt.payment_type == "BANK")
                        .where(Receipt.bank_name == data.bank_name)
                        .where(Receipt.reference_code == data.reference_code.strip())
                        .where(Receipt.payment_status == "COMPLETED")
                    ).first()
                if existing:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Bank reference code '{data.reference_code}' from {data.bank_name} has already been recorded (receipt {existing.receipt_id}).",
                    )

        with Session(engine) as session:
            staff = session.get(Staff, data.staff_id)
            if not staff:
                raise HTTPException(status_code=400, detail="Invalid staff_id")

            if p_type == "CREDIT":
                customer = session.get(Customer, data.customer_id)
                if not customer:
                    raise HTTPException(status_code=404, detail="Customer not found")
                delta = data.total_amount if not data.is_return else -data.total_amount
                new_balance = customer.current_balance + delta
                if new_balance > customer.debt_limit:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Debt limit exceeded: new balance {new_balance:.2f} > limit {customer.debt_limit:.2f}",
                    )

            try:
                receipt_id = get_next_receipt_id(session)
            except Exception as e:
                logger.error(f"Failed to generate receipt_id: {e}")
                raise HTTPException(status_code=500, detail=f"Database sequence error: {e}")

            # Fetch current business name for receipt snapshot
            from app.models import StoreSettings
            settings = session.get(StoreSettings, 1)
            business_name = settings.shop_name if settings else "DukaPOS"

            try:
                receipt = Receipt(
                    receipt_id=receipt_id,
                    staff_id=data.staff_id,
                    shift_id=data.shift_id,
                    customer_id=data.customer_id,
                    payment_type=p_type,
                    payment_subtype=data.payment_subtype,
                    reference_code=data.reference_code,
                    payment_details_json=data.payment_details_json,
                    payment_status=(data.payment_status or "COMPLETED").upper(),
                    total_amount=data.total_amount,
                    discount_amount=data.discount_amount,
                    is_return=data.is_return,
                    origin_station=data.origin_station,
                    business_name=business_name,
                    bank_name=data.bank_name,
                    bank_sender_name=data.bank_sender_name,
                    bank_confirmed=data.bank_confirmed,
                    bank_confirmation_timestamp=(
                        data.bank_confirmation_timestamp
                        or (datetime.utcnow() if data.bank_confirmed else None)
                    ),
                )
                session.add(receipt)
                session.flush()
                session.refresh(receipt)
            except Exception as e:
                logger.error(f"Failed to save Receipt: {e}")
                session.rollback()
                raise HTTPException(status_code=500, detail=f"Database error during Receipt creation: {e}")
            logger.info(f"Saved Receipt ID={receipt.id}, Code={receipt.receipt_id}")

            if not receipt.id:
                logger.error("receipt.id is None after flush/refresh!")

            # Collect (product_id, name, new_qty) for WebSocket broadcast after commit
            _stock_updates: list = []

            for idx, it in enumerate(data.items):
                logger.info(f"Adding SaleItem [{idx + 1}/{len(data.items)}]: item={it.product_id}, qty={it.quantity}, receipt_id={receipt.id}")
                # Stock check for forward sales (not returns)
                product = session.get(Product, it.product_id)
                if product is not None and not data.is_return:
                    current_stock = product.stock_quantity or 0
                    if current_stock < it.quantity:
                        session.rollback()
                        raise HTTPException(
                            status_code=400,
                            detail=f"Insufficient stock for '{product.name}': {current_stock} available, {it.quantity} requested"
                        )
                session.add(
                    SaleItem(
                        receipt_id=receipt.id,
                        product_id=it.product_id,
                        staff_id=data.staff_id,
                        quantity=it.quantity,
                        price_at_moment=it.price_at_moment,
                        is_return=data.is_return,
                    )
                )
                # Stock adjustment
                if product is not None:
                    product.stock_quantity = (product.stock_quantity or 0) - it.quantity
                    session.add(product)
                    _stock_updates.append((product.id, product.name, product.stock_quantity))
                logger.info(f"SaleItem [{idx + 1}/{len(data.items)}] added and stock adjusted.")

            # Handle account balance for credit payments
            if p_type == "CREDIT":
                delta = data.total_amount if not data.is_return else -data.total_amount
                customer = session.get(Customer, data.customer_id)
                if customer:
                    customer.current_balance += delta
                    session.add(customer)

            # SPLIT logic...
            if p_type == "SPLIT" and data.payment_details_json:
                try:
                    details = json.loads(data.payment_details_json)
                    for payment in details:
                        if payment.get("method") == "CREDIT" and data.customer_id:
                            amt = payment.get("amount", 0)
                            delta = amt if not data.is_return else -amt
                            customer = session.get(Customer, data.customer_id)
                            if customer:
                                customer.current_balance += delta
                                session.add(customer)
                except Exception:
                    pass

            # Award loyalty points: 1 point per KSh 100 spent (forward sales only)
            if data.customer_id and not data.is_return and data.total_amount > 0:
                customer = session.get(Customer, data.customer_id)
                if customer:
                    points_earned = int(data.total_amount // 100)
                    if points_earned > 0:
                        customer.points_balance += points_earned
                        customer.lifetime_points += points_earned
                        session.add(customer)

            logger.info("Ready to commit transaction...")
            session.commit()
            logger.info("Transaction committed successfully.")

            # Broadcast inventory updates to all connected POS terminals
            for pid, pname, new_qty in _stock_updates:
                broadcast_sync(create_event(
                    EventType.INVENTORY_UPDATED,
                    {"product_id": pid, "product_name": pname, "new_quantity": new_qty},
                ))

            # Eagerly load items to avoid DetachedInstanceError during serialization
            receipt = session.exec(
                select(Receipt).where(Receipt.id == receipt.id).options(selectinload(Receipt.items))
            ).first()

            logger.info(f"Transaction refreshed with items: {receipt.receipt_id}")

            kra_url = config("KRA_SUBMISSION_URL", default="").strip()
            if (kra_url):
                background_tasks.add_task(_submit_kra_task, receipt.id, kra_url)

            return receipt
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"FATAL ERROR in create_receipt: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def _submit_kra_task(receipt_id: int, kra_url: str):
    """Background task to submit KRA transaction."""
    try:
        payload = build_vscu_payload_for_transaction(receipt_id)
        if payload is None:
            return
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            kra_url, data=body,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        logger.error(f"KRA submission error for receipt {receipt_id}: {e}")


@router.get("/{receipt_id}/items", response_model=List[SaleItemRead])
def get_receipt_items(receipt_id: int):
    """Get items for a specific receipt."""
    with Session(engine) as session:
        receipt = session.get(Receipt, receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")

        items_db = session.exec(select(SaleItem).where(SaleItem.receipt_id == receipt.id)).all()
        for i in items_db:
            product = session.get(Product, i.product_id)
            i.name = product.name if product else f"Item #{i.product_id}"
        return items_db


@router.post("/{receipt_id}/print")
def print_past_receipt(receipt_id: int):
    """Reprint a past receipt."""
    from app.models import StoreSettings
    from sqlmodel import select
    from app.printer_service import run_in_printer_thread

    with Session(engine) as session:
        receipt = session.get(Receipt, receipt_id)
        if not receipt:
            raise HTTPException(status_code=404, detail="Receipt not found")

        items_db = session.exec(select(SaleItem).where(SaleItem.receipt_id == receipt.id)).all()
        items = []
        for i in items_db:
            product = session.get(Product, i.product_id)
            name = product.name if product else f"Item #{i.product_id}"
            items.append({"name": name, "qty": i.quantity, "price": i.price_at_moment})

        settings = session.exec(select(StoreSettings)).first()
        station_id = settings.station_id if settings else "POS-01"
        kra_pin = settings.kra_pin if settings else None
        contact_phone = settings.contact_phone if settings else None

        # Use business name from receipt snapshot (not current settings) for accounting accuracy
        shop_name = receipt.business_name if receipt.business_name else "DukaPOS"

        # Parse payment details if split
        payments_list = []
        if receipt.payment_type == "SPLIT" and receipt.payment_details_json:
            try:
                payments_list = json.loads(receipt.payment_details_json)
            except Exception:
                pass
        else:
            # Single payment: synthesize a payments_list entry to include bank metadata
            details = {}
            if receipt.payment_type == "BANK":
                details = {
                    "subtype": receipt.payment_subtype or "Bank Transfer",
                    "bank_name": receipt.bank_name,
                    "code": receipt.reference_code,
                    "sender": receipt.bank_sender_name,
                    "confirmed": receipt.bank_confirmed
                }
            elif receipt.payment_type == "MOBILE":
                details = {
                    "subtype": receipt.payment_subtype or "Mobile Money",
                    "code": receipt.reference_code or receipt.mpesa_code
                }

            payments_list = [{
                "method": receipt.payment_type,
                "amount": receipt.total_amount,
                "details": details
            }]

        future = run_in_printer_thread(
            _do_print_receipt,
            shop_name,
            items,
            receipt.total_amount,
            receipt.payment_type,
            station_id,
            receipt.payment_subtype,
            kra_pin,
            contact_phone,
            payments_list
        )
        try:
            future.result(timeout=10)
        except Exception:
            raise HTTPException(status_code=503, detail="Printer timeout or offline")

    return {"status": "ok"}


class PriceOverrideLogCreate(BaseModel):
    cashier_id: Optional[int] = None
    product_id: Optional[int] = None
    new_price: float
    timestamp: Optional[str] = None


@router.post("/price-override-log", status_code=201)
def log_price_override(data: PriceOverrideLogCreate):
    """Record an admin-authorized price override for audit purposes."""
    from app.models import PriceOverrideLog
    from datetime import datetime

    ts = datetime.utcnow()
    if data.timestamp:
        try:
            ts = datetime.fromisoformat(data.timestamp.replace("Z", "+00:00"))
        except ValueError:
            pass

    with Session(engine) as session:
        log = PriceOverrideLog(
            cashier_id=data.cashier_id,
            product_id=data.product_id,
            new_price=data.new_price,
            timestamp=ts,
        )
        session.add(log)
        session.commit()
    return {"ok": True}
