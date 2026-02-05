"""Transactions API: persist sale/return on payment complete."""
import json
import threading
import urllib.request
from typing import List, Optional

from app.config import config
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine, get_next_invoice_number
from app.models import Transaction, TransactionItem, User, Customer, Product
from app.routers.tax_export import build_vscu_payload_for_transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionItemPayload(BaseModel):
    product_id: int
    quantity: int
    price_at_moment: float


class TransactionCreate(BaseModel):
    cashier_id: int = 1
    shift_id: Optional[int] = None
    customer_id: Optional[int] = None  # required for CREDIT
    payment_method: str  # "CASH", "MPESA", "CREDIT"
    mpesa_code: Optional[str] = None
    checkout_request_id: Optional[str] = None  # M-Pesa STK; when set, payment_status should be PENDING
    payment_status: str = "COMPLETED"  # COMPLETED, PENDING, FAILED
    use_local_invoice: bool = True  # when True (eTIMS disabled), assign local Invoice_ID
    items: List[TransactionItemPayload]
    total_amount: float
    is_return: bool = False


class TransactionRead(BaseModel):
    id: int
    payment_method: str
    total_amount: float
    is_return: bool

    model_config = {"from_attributes": True}


@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(data: TransactionCreate):
    """Persist transaction and items (call on payment complete)."""
    method = (data.payment_method or "").upper()
    if method == "CREDIT" and not data.customer_id:
        raise HTTPException(status_code=400, detail="customer_id required for CREDIT payment")

    with Session(engine) as session:
        user = session.get(User, data.cashier_id)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid cashier_id")

        if method == "CREDIT":
            customer = session.get(Customer, data.customer_id)
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            # Sale increases balance, return decreases
            delta = data.total_amount if not data.is_return else -data.total_amount
            new_balance = customer.current_balance + delta
            if new_balance > customer.debt_limit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Debt limit exceeded: new balance {new_balance:.2f} > limit {customer.debt_limit:.2f}",
                )

        invoice_number = None
        if data.use_local_invoice:
            invoice_number = get_next_invoice_number()

        tx = Transaction(
            cashier_id=data.cashier_id,
            shift_id=data.shift_id,
            customer_id=data.customer_id,
            payment_method=method,
            mpesa_code=data.mpesa_code,
            checkout_request_id=data.checkout_request_id,
            payment_status=(data.payment_status or "COMPLETED").upper(),
            invoice_number=invoice_number,
            total_amount=data.total_amount,
            is_return=data.is_return,
        )
        session.add(tx)
        session.flush()
        for it in data.items:
            session.add(
                TransactionItem(
                    transaction_id=tx.id,
                    product_id=it.product_id,
                    cashier_id=data.cashier_id,  # Track which cashier sold this item
                    quantity=it.quantity,
                    price_at_moment=it.price_at_moment,
                    is_return=data.is_return,  # Flag if this is a return
                )
            )
            # Stock: subtract quantity (sale). For returns, quantity is negative so this adds back.
            product = session.get(Product, it.product_id)
            if product is not None:
                product.stock_quantity = (product.stock_quantity or 0) - it.quantity
                session.add(product)
        if method == "CREDIT":
            delta = data.total_amount if not data.is_return else -data.total_amount
            customer = session.get(Customer, data.customer_id)
            if customer:
                customer.current_balance += delta
                session.add(customer)
        session.commit()
        session.refresh(tx)

        # Optional live KRA submission: when KRA_SUBMISSION_URL is set, POST VSCU payload in background
        kra_url = config("KRA_SUBMISSION_URL", default="").strip()
        if kra_url and not data.use_local_invoice:
            tx_id = tx.id

            def _submit_kra():
                try:
                    payload = build_vscu_payload_for_transaction(tx_id)
                    if payload is None:
                        return
                    body = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        kra_url,
                        data=body,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    urllib.request.urlopen(req, timeout=10)
                except Exception:
                    pass  # optional; do not fail the transaction

            threading.Thread(target=_submit_kra, daemon=True).start()

        return tx
