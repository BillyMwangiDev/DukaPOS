"""Customers API: CRUD for debtors (Credit)."""
from typing import List, Optional
from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Customer

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    kra_pin: Optional[str] = None
    debt_limit: float = 0.0


class CustomerRead(BaseModel):
    id: int
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    kra_pin: str = ""
    current_balance: float
    debt_limit: float
    points_balance: int = 0
    lifetime_points: int = 0

    model_config = {"from_attributes": True}


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    kra_pin: Optional[str] = None
    current_balance: Optional[float] = None
    debt_limit: Optional[float] = None


class PaymentRecordRequest(BaseModel):
    """Body for recording a payment (API/test compatibility)."""
    amount: float
    payment_method: Optional[str] = None
    notes: Optional[str] = None


@router.get("", response_model=List[CustomerRead])
def list_customers(q: Optional[str] = Query(None)):
    """List customers, optionally search by name or phone."""
    with Session(engine) as session:
        stmt = select(Customer)
        if q and q.strip():
            qq = q.strip().lower()
            stmt = stmt.where(
                (Customer.name.ilike(f"%{qq}%")) | (Customer.phone.ilike(f"%{qq}%"))
            )
        customers = session.exec(stmt).all()
        return list(customers)


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(customer_id: int):
    with Session(engine) as session:
        customer = session.get(Customer, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        return customer


@router.post("", response_model=CustomerRead, status_code=201)
def create_customer(data: CustomerCreate):
    if data.debt_limit < 0:
        raise HTTPException(status_code=400, detail="debt_limit cannot be negative")
    with Session(engine) as session:
        customer = Customer(
            name=data.name,
            phone=data.phone,
            email=data.email,
            address=data.address,
            kra_pin=(data.kra_pin or "").strip(),
            current_balance=0.0,
            debt_limit=data.debt_limit,
        )
        session.add(customer)
        session.commit()
        session.refresh(customer)
        return customer


@router.patch("/{customer_id}", response_model=CustomerRead)
def update_customer(customer_id: int, data: CustomerUpdate):
    updates = data.model_dump(exclude_unset=True)
    if "debt_limit" in updates and updates["debt_limit"] is not None and updates["debt_limit"] < 0:
        raise HTTPException(status_code=400, detail="debt_limit cannot be negative")
    with Session(engine) as session:
        customer = session.get(Customer, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        for k, v in updates.items():
            if k == "kra_pin":
                setattr(customer, k, (v or "").strip())
            elif k == "current_balance" and v is not None and v < 0:
                setattr(customer, k, 0.0)
            else:
                setattr(customer, k, v)
        session.add(customer)
        session.commit()
        session.refresh(customer)
        return customer


@router.post("/{customer_id}/payment")
def record_payment(
    customer_id: int,
    amount: Optional[float] = Query(None),
    body: Optional[PaymentRecordRequest] = Body(None),
):
    """Record a payment (reduces current_balance). Accept amount in body or query (API/test compatibility)."""
    amt = (body.amount if body is not None else None) or amount
    if amt is None:
        raise HTTPException(status_code=400, detail="Amount required (body.amount or query amount)")
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    with Session(engine) as session:
        customer = session.get(Customer, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer.current_balance = max(0.0, customer.current_balance - amt)
        session.add(customer)
        session.commit()
        session.refresh(customer)
        return {
            "customer_id": customer_id,
            "id": customer_id,
            "payment_id": customer_id,
            "amount": amt,
            "new_balance": customer.current_balance,
        }


class PointsRequest(BaseModel):
    points: int  # positive = add, negative = redeem


@router.post("/{customer_id}/add-points")
def adjust_points(customer_id: int, data: PointsRequest):
    """Add or redeem loyalty points for a customer."""
    with Session(engine) as session:
        customer = session.get(Customer, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer.points_balance = max(0, customer.points_balance + data.points)
        if data.points > 0:
            customer.lifetime_points += data.points
        session.add(customer)
        session.commit()
        session.refresh(customer)
        return {"customer_id": customer_id, "points_balance": customer.points_balance, "lifetime_points": customer.lifetime_points}


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int):
    """Delete a customer (API/test compatibility)."""
    with Session(engine) as session:
        customer = session.get(Customer, customer_id)
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        session.delete(customer)
        session.commit()
        return None
