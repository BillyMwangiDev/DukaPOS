"""Supplier management and Purchase Orders for inventory restocking."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Supplier, PurchaseOrder, PurchaseOrderItem, Product, StockAdjustment

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def get_db():
    with Session(engine) as session:
        yield session


# ── Supplier schemas ──────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class SupplierRead(BaseModel):
    id: int
    name: str
    contact_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]

    model_config = {"from_attributes": True}


# ── Purchase Order schemas ────────────────────────────────────────────────────

class POItemCreate(BaseModel):
    product_id: int
    qty_ordered: int
    unit_cost: float


class POCreate(BaseModel):
    notes: str = ""
    staff_id: Optional[int] = None
    items: List[POItemCreate]


class POItemRead(BaseModel):
    id: int
    product_id: int
    qty_ordered: int
    qty_received: int
    unit_cost: float

    model_config = {"from_attributes": True}


class PORead(BaseModel):
    id: int
    supplier_id: int
    staff_id: Optional[int]
    created_at: str
    status: str
    total_cost: float
    notes: str
    items: List[POItemRead]

    model_config = {"from_attributes": True}


# ── Supplier endpoints ────────────────────────────────────────────────────────

@router.get("", response_model=List[SupplierRead])
def list_suppliers(session: Session = Depends(get_db)):
    return session.exec(select(Supplier)).all()


@router.post("", response_model=SupplierRead, status_code=201)
def create_supplier(data: SupplierCreate, session: Session = Depends(get_db)):
    supplier = Supplier(**data.model_dump())
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.put("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    session: Session = Depends(get_db),
):
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(supplier, k, v)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int, session: Session = Depends(get_db)):
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    session.delete(supplier)
    session.commit()
    return None


# ── Purchase Order endpoints ──────────────────────────────────────────────────

def _po_to_read(po: PurchaseOrder, session: Session) -> PORead:
    items = session.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.po_id == po.id)
    ).all()
    return PORead(
        id=po.id,
        supplier_id=po.supplier_id,
        staff_id=po.staff_id,
        created_at=po.created_at.isoformat() + "Z",
        status=po.status,
        total_cost=po.total_cost,
        notes=po.notes,
        items=[POItemRead.model_validate(it) for it in items],
    )


@router.get("/{supplier_id}/purchase-orders", response_model=List[PORead])
def list_pos(supplier_id: int, session: Session = Depends(get_db)):
    """List purchase orders for a supplier."""
    if not session.get(Supplier, supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
    pos = session.exec(
        select(PurchaseOrder).where(PurchaseOrder.supplier_id == supplier_id)
        .order_by(PurchaseOrder.created_at.desc())  # type: ignore[attr-defined]
    ).all()
    return [_po_to_read(po, session) for po in pos]


@router.post("/{supplier_id}/purchase-orders", response_model=PORead, status_code=201)
def create_po(
    supplier_id: int,
    data: POCreate,
    session: Session = Depends(get_db),
):
    """Create a purchase order for a supplier."""
    if not session.get(Supplier, supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")
    for it in data.items:
        if it.qty_ordered <= 0:
            raise HTTPException(status_code=400, detail=f"qty_ordered must be positive (got {it.qty_ordered})")
        if it.unit_cost < 0:
            raise HTTPException(status_code=400, detail=f"unit_cost cannot be negative (got {it.unit_cost})")
        if not session.get(Product, it.product_id):
            raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")
    total = sum(it.qty_ordered * it.unit_cost for it in data.items)
    po = PurchaseOrder(
        supplier_id=supplier_id,
        staff_id=data.staff_id,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        status="pending",
        total_cost=round(total, 2),
        notes=data.notes,
    )
    session.add(po)
    session.flush()
    for it in data.items:
        session.add(PurchaseOrderItem(
            po_id=po.id,
            product_id=it.product_id,
            qty_ordered=it.qty_ordered,
            qty_received=0,
            unit_cost=it.unit_cost,
        ))
    session.commit()
    session.refresh(po)
    return _po_to_read(po, session)


@router.put("/purchase-orders/{po_id}/receive", response_model=PORead)
def receive_po(po_id: int, staff_id: Optional[int] = None, session: Session = Depends(get_db)):
    """
    Mark a purchase order as received:
    - Sets status to 'received'
    - Increments stock_quantity for each ordered product
    - Creates a StockAdjustment record for each item
    """
    po = session.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status == "received":
        raise HTTPException(status_code=400, detail="Purchase order already received")

    items = session.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.po_id == po_id)
    ).all()

    for it in items:
        product = session.get(Product, it.product_id)
        if product:
            product.stock_quantity += it.qty_ordered
            it.qty_received = it.qty_ordered
            session.add(product)
            session.add(it)
            session.add(StockAdjustment(
                product_id=it.product_id,
                staff_id=staff_id or po.staff_id,
                quantity_change=it.qty_ordered,
                reason="Received",
                timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
            ))

    po.status = "received"
    session.add(po)
    session.commit()
    session.refresh(po)
    return _po_to_read(po, session)
