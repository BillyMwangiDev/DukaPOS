"""Shifts API: Open Shift, Close Shift, Z-Report."""
from typing import Optional
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Shift, Receipt, Staff

router = APIRouter(prefix="/shifts", tags=["shifts"])


class ShiftOpenRequest(BaseModel):
    staff_id: int = 1
    opening_float: float = 0.0


class ShiftOpenResponse(BaseModel):
    id: int
    opened_at: str
    opening_float: float
    staff_id: int

    model_config = {"from_attributes": True}


class ShiftCloseRequest(BaseModel):
    closing_actual: float = 0.0


class ZReportResponse(BaseModel):
    shift_id: int
    opening_float: float
    closing_expected: float
    closing_actual: float
    total_cash_sales: float
    total_mobile_sales: float
    total_credit_sales: float
    transaction_count: int


@router.post("/open", response_model=ShiftOpenResponse, status_code=201)
def open_shift(data: Optional[ShiftOpenRequest] = Body(None)):
    """Open a new shift."""
    req = data if data is not None else ShiftOpenRequest()
    with Session(engine) as session:
        staff = session.get(Staff, req.staff_id)
        if not staff:
            raise HTTPException(status_code=400, detail="Invalid staff_id")

        existing = session.exec(
            select(Shift).where(
                Shift.cashier_id == req.staff_id,
                Shift.closed_at.is_(None),
            )
        ).first()
        if existing:
            return ShiftOpenResponse(
                id=existing.id,
                opened_at=existing.opened_at.isoformat(),
                opening_float=existing.opening_float,
                staff_id=existing.cashier_id,
            )

        shift = Shift(
            cashier_id=req.staff_id,
            opening_float=req.opening_float,
        )
        session.add(shift)
        session.commit()
        session.refresh(shift)
        return ShiftOpenResponse(
            id=shift.id,
            opened_at=shift.opened_at.isoformat(),
            opening_float=shift.opening_float,
            staff_id=shift.cashier_id,
        )


@router.get("/current")
def get_current_shift(staff_id: int = 1):
    """Get current open shift for staff member."""
    with Session(engine) as session:
        shift = session.exec(
            select(Shift).where(
                Shift.cashier_id == staff_id,
                Shift.closed_at.is_(None),
            )
        ).first()
        if not shift:
            return {"shift": None}
        payload = {
            "id": shift.id,
            "opened_at": shift.opened_at.isoformat(),
            "opening_float": shift.opening_float,
            "staff_id": shift.cashier_id,
        }
        return {"shift": payload, **payload}


def _compute_shift_totals(session: Session, shift_id: int) -> dict:
    """Compute cash/mobile/credit totals."""
    receipts = session.exec(
        select(Receipt).where(Receipt.shift_id == shift_id)
    ).all()
    total_cash = 0.0
    total_mobile = 0.0
    total_credit = 0.0
    for r in receipts:
        amt = r.total_amount if not r.is_return else -r.total_amount
        ptype = r.payment_type.upper()
        if ptype == "CASH":
            total_cash += amt
        elif ptype in ["MOBILE", "MPESA"]:
            total_mobile += amt
        elif ptype == "CREDIT":
            total_credit += amt

    shift = session.get(Shift, shift_id)
    opening = shift.opening_float if shift else 0.0
    closing_expected = opening + total_cash
    return {
        "total_cash_sales": total_cash,
        "total_mobile_sales": total_mobile,
        "total_credit_sales": total_credit,
        "closing_expected": closing_expected,
        "opening_float": opening,
        "transaction_count": len(receipts),
    }


@router.get("/{shift_id}/z-report", response_model=ZReportResponse)
def get_z_report(shift_id: int):
    """Get Z-Report (Expected vs Actual) for shift."""
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
            total_mobile_sales=totals["total_mobile_sales"],
            total_credit_sales=totals["total_credit_sales"],
            transaction_count=totals["transaction_count"],
        )


@router.post("/{shift_id}/close")
def close_shift(shift_id: int, data: ShiftCloseRequest):
    """Close shift and return final Z-Report data."""
    with Session(engine) as session:
        shift = session.get(Shift, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        if shift.closed_at is not None:
            raise HTTPException(status_code=400, detail="Shift already closed")
        totals = _compute_shift_totals(session, shift_id)
        shift.closing_actual = data.closing_actual
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
            "closing_actual": data.closing_actual,
            "total_cash_sales": totals["total_cash_sales"],
            "total_mobile_sales": totals["total_mobile_sales"],
            "total_credit_sales": totals["total_credit_sales"],
            "transaction_count": totals["transaction_count"],
        }
