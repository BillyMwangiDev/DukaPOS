"""Discount management: create and apply order/item-level discounts."""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Discount

router = APIRouter(prefix="/discounts", tags=["discounts"])


def get_db():
    with Session(engine) as session:
        yield session


class DiscountCreate(BaseModel):
    name: str
    discount_type: str  # "percent" or "fixed"
    value: float
    scope: str = "order"  # "order" or "item"
    code: Optional[str] = None
    start_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    end_date: Optional[str] = None


class DiscountUpdate(BaseModel):
    name: Optional[str] = None
    discount_type: Optional[str] = None
    value: Optional[float] = None
    scope: Optional[str] = None
    code: Optional[str] = None
    is_active: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class DiscountRead(BaseModel):
    id: int
    name: str
    discount_type: str
    value: float
    scope: str
    is_active: bool
    code: Optional[str]
    start_date: Optional[str] = None
    end_date: Optional[str] = None

    model_config = {"from_attributes": True}


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None


def _date_to_str(d: Optional[datetime]) -> Optional[str]:
    return d.strftime("%Y-%m-%d") if d else None


def _discount_to_read(d: Discount) -> DiscountRead:
    return DiscountRead(
        id=d.id,
        name=d.name,
        discount_type=d.discount_type,
        value=d.value,
        scope=d.scope,
        is_active=d.is_active,
        code=d.code,
        start_date=_date_to_str(d.start_date),
        end_date=_date_to_str(d.end_date),
    )


@router.get("", response_model=List[DiscountRead])
def list_discounts(
    active_only: bool = True,
    session: Session = Depends(get_db),
):
    """List discounts. By default returns only active ones (respecting validity window)."""
    stmt = select(Discount)
    if active_only:
        stmt = stmt.where(Discount.is_active == True)  # noqa: E712
    rows = session.exec(stmt).all()
    if active_only:
        today = datetime.now(timezone.utc).replace(tzinfo=None)
        rows = [
            d for d in rows
            if (d.start_date is None or d.start_date <= today)
            and (d.end_date is None or d.end_date >= today)
        ]
    return [_discount_to_read(d) for d in rows]


@router.post("", response_model=DiscountRead, status_code=201)
def create_discount(data: DiscountCreate, session: Session = Depends(get_db)):
    """Create a new discount."""
    if data.discount_type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="discount_type must be 'percent' or 'fixed'")
    if data.scope not in ("order", "item"):
        raise HTTPException(status_code=400, detail="scope must be 'order' or 'item'")
    if data.value <= 0:
        raise HTTPException(status_code=400, detail="Discount value must be positive")
    if data.discount_type == "percent" and data.value > 100:
        raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 100%")
    raw = data.model_dump()
    raw["start_date"] = _parse_date(raw.pop("start_date", None))
    raw["end_date"] = _parse_date(raw.pop("end_date", None))
    discount = Discount(**raw)
    session.add(discount)
    session.commit()
    session.refresh(discount)
    return _discount_to_read(discount)


@router.put("/{discount_id}", response_model=DiscountRead)
def update_discount(
    discount_id: int,
    data: DiscountUpdate,
    session: Session = Depends(get_db),
):
    """Update a discount (including deactivating it)."""
    discount = session.get(Discount, discount_id)
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    updates = data.model_dump(exclude_unset=True)
    if "value" in updates:
        if updates["value"] <= 0:
            raise HTTPException(status_code=400, detail="Discount value must be positive")
        dtype = updates.get("discount_type") or discount.discount_type
        if dtype == "percent" and updates["value"] > 100:
            raise HTTPException(status_code=400, detail="Percentage discount cannot exceed 100%")
    if "start_date" in updates:
        updates["start_date"] = _parse_date(updates["start_date"])
    if "end_date" in updates:
        updates["end_date"] = _parse_date(updates["end_date"])
    for k, v in updates.items():
        setattr(discount, k, v)
    session.add(discount)
    session.commit()
    session.refresh(discount)
    return _discount_to_read(discount)


@router.post("/validate-code", response_model=DiscountRead)
def validate_promo_code(body: dict, session: Session = Depends(get_db)):
    """Validate a promo code and return the active discount, or 404 if invalid."""
    code = (body.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    discount = session.exec(
        select(Discount).where(Discount.code == code, Discount.is_active == True)  # noqa: E712
    ).first()
    if not discount:
        raise HTTPException(status_code=404, detail="Invalid or expired promo code")
    # Check validity window
    today = datetime.now(timezone.utc).replace(tzinfo=None)
    if discount.start_date and discount.start_date > today:
        raise HTTPException(status_code=404, detail="Promo code is not yet active")
    if discount.end_date and discount.end_date < today:
        raise HTTPException(status_code=404, detail="Promo code has expired")
    return _discount_to_read(discount)


@router.delete("/{discount_id}", status_code=204)
def delete_discount(discount_id: int, session: Session = Depends(get_db)):
    """Permanently delete a discount."""
    discount = session.get(Discount, discount_id)
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    session.delete(discount)
    session.commit()
    return None
