"""Transactions API: persist sale/return on payment complete."""
import json
import threading
import urllib.request
from typing import List, Optional

from app.config import config
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.database import engine, get_next_receipt_id
from app.models import Receipt, SaleItem, Staff, Customer, Product
from app.routers.tax_export import build_vscu_payload_for_transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])


class SaleItemPayload(BaseModel):
    product_id: int
    quantity: int
    price_at_moment: float


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
    is_return: bool = False


class ReceiptRead(BaseModel):
    id: int
    receipt_id: str
    payment_type: str
    total_amount: float
    is_return: bool

    model_config = {"from_attributes": True}


@router.post("", response_model=ReceiptRead, status_code=201)
def create_receipt(data: ReceiptCreate):
    """Persist receipt and sale items."""
    p_type = (data.payment_type or "").upper()

    # Validation for Credit
    if p_type == "CREDIT" and not data.customer_id:
        raise HTTPException(status_code=400, detail="customer_id required for CREDIT payment")

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

        receipt_id = get_next_receipt_id()

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
            is_return=data.is_return,
            origin_station=data.origin_station,
        )
        session.add(receipt)
        session.flush()

        for it in data.items:
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
            product = session.get(Product, it.product_id)
            if product is not None:
                # If quantity > 0 (sale), we subtract from stock
                # If quantity < 0 (return/refund), we add back to stock
                product.stock_quantity = (product.stock_quantity or 0) - it.quantity
                session.add(product)

        # Handle account balance for credit payments
        if p_type == "CREDIT":
            delta = data.total_amount if not data.is_return else -data.total_amount
            customer = session.get(Customer, data.customer_id)
            if customer:
                customer.current_balance += delta
                session.add(customer)

        # If it's a split payment, check if it contains credit
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

        session.commit()
        session.refresh(receipt)

        # Background KRA submission logic if applicable
        kra_url = config("KRA_SUBMISSION_URL", default="").strip()
        if kra_url:
            receipt_id_db = receipt.id

            def _submit_kra():
                try:
                    # Note: this might need updating if build_vscu_payload expects Transaction
                    payload = build_vscu_payload_for_transaction(receipt_id_db)
                    if payload is None:
                        return
                    body = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        kra_url, data=body,
                        headers={"Content-Type": "application/json"}, method="POST"
                    )
                    urllib.request.urlopen(req, timeout=10)
                except Exception:
                    pass
            threading.Thread(target=_submit_kra, daemon=True).start()

        return receipt

