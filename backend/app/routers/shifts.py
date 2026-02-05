"""Shifts API: Open Shift, Close Shift, Z-Report."""
from typing import Optional
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Shift, Transaction, User

router = APIRouter(prefix="/shifts", tags=["shifts"])


class ShiftOpenRequest(BaseModel):
    cashier_id: int = 1
    opening_float: float = 0.0


class ShiftOpenResponse(BaseModel):
    id: int
    opened_at: str
    opening_float: float
    cashier_id: int

    model_config = {"from_attributes": True}


class ShiftCloseRequest(BaseModel):
    closing_actual: float = 0.0


class ZReportResponse(BaseModel):
    shift_id: int
    opening_float: float
    closing_expected: float
    closing_actual: float
    total_cash_sales: float
    total_mpesa_sales: float
    total_credit_sales: float
    transaction_count: int


@router.post("/open", response_model=ShiftOpenResponse, status_code=201)
def open_shift(data: Optional[ShiftOpenRequest] = Body(None)):
    """Open a new shift with opening float. Only one open shift per cashier. Idempotent: if cashier already has open shift, returns 200 with that shift."""
    req = data if data is not None else ShiftOpenRequest()
    with Session(engine) as session:
        user = session.get(User, req.cashier_id)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid cashier_id")
        existing = session.exec(
            select(Shift).where(
                Shift.cashier_id == req.cashier_id,
                Shift.closed_at.is_(None),
            )
        ).first()
        if existing:
            # Idempotent: return existing open shift (TestSprite / API compatibility)
            return ShiftOpenResponse(
                id=existing.id,
                opened_at=existing.opened_at.isoformat(),
                opening_float=existing.opening_float,
                cashier_id=existing.cashier_id,
            )
        shift = Shift(
            cashier_id=req.cashier_id,
            opening_float=req.opening_float,
        )
        session.add(shift)
        session.commit()
        session.refresh(shift)
        return ShiftOpenResponse(
            id=shift.id,
            opened_at=shift.opened_at.isoformat(),
            opening_float=shift.opening_float,
            cashier_id=shift.cashier_id,
        )


@router.get("/current")
def get_current_shift(cashier_id: int = 1):
    """Get current open shift for cashier. Returns shift at top level and under 'shift' for frontend compatibility."""
    with Session(engine) as session:
        shift = session.exec(
            select(Shift).where(
                Shift.cashier_id == cashier_id,
                Shift.closed_at.is_(None),
            )
        ).first()
        if not shift:
            return {"shift": None}
        payload = {
            "id": shift.id,
            "opened_at": shift.opened_at.isoformat(),
            "opening_float": shift.opening_float,
            "cashier_id": shift.cashier_id,
        }
        return {"shift": payload, **payload}


def _compute_shift_totals(session: Session, shift_id: int) -> dict:
    """Compute cash/mpesa/credit totals and expected closing cash for shift."""
    transactions = session.exec(
        select(Transaction).where(Transaction.shift_id == shift_id)
    ).all()
    total_cash = 0.0
    total_mpesa = 0.0
    total_credit = 0.0
    for tx in transactions:
        amt = tx.total_amount if not tx.is_return else -tx.total_amount
        if tx.payment_method == "CASH":
            total_cash += amt
        elif tx.payment_method == "MPESA":
            total_mpesa += amt
        elif tx.payment_method == "CREDIT":
            total_credit += amt
    shift = session.get(Shift, shift_id)
    opening = shift.opening_float if shift else 0.0
    closing_expected = opening + total_cash
    return {
        "total_cash_sales": total_cash,
        "total_mpesa_sales": total_mpesa,
        "total_credit_sales": total_credit,
        "closing_expected": closing_expected,
        "opening_float": opening,
        "transaction_count": len(transactions),
    }


@router.get("/{shift_id}/z-report", response_model=ZReportResponse)
def get_z_report(shift_id: int):
    """Get Z-Report (Expected vs Actual) for shift. Does not close the shift."""
    with Session(engine) as session:
        shift = session.get(Shift, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        if shift.closed_at is not None:
            raise HTTPException(status_code=400, detail="Shift already closed")
        totals = _compute_shift_totals(session, shift_id)
        return ZReportResponse(
            shift_id=shift_id,
            opening_float=totals["opening_float"],
            closing_expected=totals["closing_expected"],
            closing_actual=shift.closing_actual or 0.0,
            total_cash_sales=totals["total_cash_sales"],
            total_mpesa_sales=totals["total_mpesa_sales"],
            total_credit_sales=totals["total_credit_sales"],
            transaction_count=totals["transaction_count"],
        )


@router.post("/{shift_id}/close")
def close_shift(shift_id: int, data: ShiftCloseRequest):
    """Close shift: set closing_actual, closing_expected (computed). Returns Z-Report."""
    with Session(engine) as session:
        shift = session.get(Shift, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        if shift.closed_at is not None:
            raise HTTPException(status_code=400, detail="Shift already closed")
        totals = _compute_shift_totals(session, shift_id)
        req = data if data is not None else ShiftCloseRequest()
        shift.closing_actual = req.closing_actual
        shift.closing_expected = totals["closing_expected"]
        from datetime import datetime
        shift.closed_at = datetime.utcnow()
        session.add(shift)
        session.commit()
        session.refresh(shift)
        return {
            "status": "closed",
            "shift_id": shift_id,
            "closed_at": shift.closed_at.isoformat(),
            "opening_float": totals["opening_float"],
            "closing_expected": totals["closing_expected"],
            "closing_actual": req.closing_actual,
            "total_cash_sales": totals["total_cash_sales"],
            "total_mpesa_sales": totals["total_mpesa_sales"],
            "total_credit_sales": totals["total_credit_sales"],
            "transaction_count": totals["transaction_count"],
        }
