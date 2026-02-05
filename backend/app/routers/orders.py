"""Held orders (save/restore cart) per cashier."""
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import HeldOrder, User

router = APIRouter(prefix="/orders", tags=["orders"])


class HoldOrderRequest(BaseModel):
    """Accept optional cashier_id, total_gross, notes (API/test compatibility)."""
    cashier_id: int = 1
    items: list[dict] = []  # cart items: productId, name, barcode, quantity, priceGross, etc.
    total_gross: float = 0.0
    notes: Optional[str] = None


class HoldOrderResponse(BaseModel):
    id: int
    cashier_id: int
    total_gross: float
    notes: str = ""
    created_at: str


class HeldOrderRead(BaseModel):
    id: int
    cashier_id: int
    items: list[dict]
    total_gross: float
    notes: str = ""
    created_at: str


@router.post("/hold", response_model=HoldOrderResponse, status_code=201)
def hold_order(data: HoldOrderRequest):
    """Save current cart as a held order for this cashier."""
    with Session(engine) as session:
        user = session.get(User, data.cashier_id)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid cashier_id")
        items_json = json.dumps(data.items)
        notes = (data.notes or "").strip()
        held = HeldOrder(
            cashier_id=data.cashier_id,
            items_json=items_json,
            total_gross=data.total_gross,
            notes=notes,
        )
        session.add(held)
        session.commit()
        session.refresh(held)
        return HoldOrderResponse(
            id=held.id or 0,
            cashier_id=held.cashier_id,
            total_gross=held.total_gross,
            notes=held.notes or "",
            created_at=held.created_at.isoformat(),
        )


@router.get("/held", response_model=list[HoldOrderResponse])
def list_held_orders(cashier_id: int = Query(1, description="Current cashier (default 1 for API/test compatibility)")):
    """List held orders for this cashier, newest first."""
    with Session(engine) as session:
        held_list = session.exec(
            select(HeldOrder).where(HeldOrder.cashier_id == cashier_id).order_by(HeldOrder.created_at.desc())
        ).all()
        return [
            HoldOrderResponse(
                id=h.id or 0,
                cashier_id=h.cashier_id,
                total_gross=h.total_gross,
                notes=h.notes or "",
                created_at=h.created_at.isoformat(),
            )
            for h in held_list
        ]


@router.get("/held/{order_id}", response_model=HeldOrderRead)
def get_held_order(order_id: int, cashier_id: int = Query(1, description="Current cashier (default 1 for API/test compatibility)")):
    """Get one held order (for restore). Returns items + total."""
    with Session(engine) as session:
        held = session.get(HeldOrder, order_id)
        if not held:
            raise HTTPException(status_code=404, detail="Held order not found")
        if held.cashier_id != cashier_id:
            raise HTTPException(status_code=403, detail="Not your held order")
        try:
            items = json.loads(held.items_json) if held.items_json else []
        except json.JSONDecodeError:
            items = []
        return HeldOrderRead(
            id=held.id or 0,
            cashier_id=held.cashier_id,
            items=items,
            total_gross=held.total_gross,
            notes=held.notes or "",
            created_at=held.created_at.isoformat(),
        )


@router.delete("/held/{order_id}", status_code=204)
def delete_held_order(order_id: int, cashier_id: int = Query(1, description="Current cashier (default 1 for API/test compatibility)")):
    """Remove a held order (after restore or discard)."""
    with Session(engine) as session:
        held = session.get(HeldOrder, order_id)
        if not held:
            raise HTTPException(status_code=404, detail="Held order not found")
        if held.cashier_id != cashier_id:
            raise HTTPException(status_code=403, detail="Not your held order")
        session.delete(held)
        session.commit()
        return None
