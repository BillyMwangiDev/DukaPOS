"""Held orders (save/restore cart) per cashier."""
import json
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import HeldOrder, Staff

router = APIRouter(prefix="/orders", tags=["orders"])


class HoldOrderRequest(BaseModel):
    staff_id: int = 1
    items: list[dict] = []
    total_gross: float = 0.0
    notes: Optional[str] = None


class HoldOrderResponse(BaseModel):
    id: int
    staff_id: int
    total_gross: float
    notes: str = ""
    created_at: str


class HeldOrderRead(BaseModel):
    id: int
    staff_id: int
    items: list[dict]
    total_gross: float
    notes: str = ""
    created_at: str


@router.post("/hold", response_model=HoldOrderResponse, status_code=201)
def hold_order(data: HoldOrderRequest):
    """Save cart as held order."""
    with Session(engine) as session:
        staff = session.get(Staff, data.staff_id)
        if not staff:
            raise HTTPException(status_code=400, detail="Invalid staff_id")
        items_json = json.dumps(data.items)
        held = HeldOrder(
            staff_id=data.staff_id,
            items_json=items_json,
            total_gross=data.total_gross,
            notes=(data.notes or "").strip(),
        )
        session.add(held)
        session.commit()
        session.refresh(held)
        return HoldOrderResponse(
            id=held.id or 0,
            staff_id=held.staff_id,
            total_gross=held.total_gross,
            notes=held.notes or "",
            created_at=held.created_at.isoformat(),
        )


@router.get("/held", response_model=list[HoldOrderResponse])
def list_held_orders(staff_id: int = Query(1)):
    """List held orders for staff member."""
    with Session(engine) as session:
        held_list = session.exec(
            select(HeldOrder).where(HeldOrder.staff_id == staff_id).order_by(HeldOrder.created_at.desc())
        ).all()
        return [
            HoldOrderResponse(
                id=h.id or 0,
                staff_id=h.staff_id,
                total_gross=h.total_gross,
                notes=h.notes or "",
                created_at=h.created_at.isoformat(),
            )
            for h in held_list
        ]


@router.get("/held/{order_id}", response_model=HeldOrderRead)
def get_held_order(order_id: int, staff_id: int = Query(1)):
    """Get one held order for restore."""
    with Session(engine) as session:
        held = session.get(HeldOrder, order_id)
        if not held:
            raise HTTPException(status_code=404, detail="Held order not found")
        if held.staff_id != staff_id:
            raise HTTPException(status_code=403, detail="Not your held order")
        try:
            items = json.loads(held.items_json) if held.items_json else []
        except: items = []
        return HeldOrderRead(
            id=held.id or 0,
            staff_id=held.staff_id,
            items=items,
            total_gross=held.total_gross,
            notes=held.notes or "",
            created_at=held.created_at.isoformat(),
        )


@router.delete("/held/{order_id}", status_code=204)
def delete_held_order(order_id: int, staff_id: int = Query(1)):
    """Remove a held order."""
    with Session(engine) as session:
        held = session.get(HeldOrder, order_id)
        if not held:
            raise HTTPException(status_code=404, detail="Held order not found")
        if held.staff_id != staff_id:
            raise HTTPException(status_code=403, detail="Not your held order")
        session.delete(held)
        session.commit()
        return None

