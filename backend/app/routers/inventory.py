"""Inventory bulk upload (Excel/CSV) and stock adjustment."""
import io
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select
import pandas as pd

from app.database import engine
from app.models import Product, StockAdjustment
from app.websocket_manager import broadcast_sync, create_event, EventType

router = APIRouter(prefix="/inventory", tags=["inventory"])


def get_db():
    with Session(engine) as session:
        yield session


# ── Stock Adjustment ──────────────────────────────────────────────────────────

class StockAdjustCreate(BaseModel):
    product_id: int
    quantity_change: int  # positive = add, negative = remove
    reason: str  # "Damage", "Expired", "Theft", "Received", "Correction"
    staff_id: Optional[int] = None


class StockAdjustRead(BaseModel):
    id: int
    product_id: int
    staff_id: Optional[int]
    quantity_change: int
    reason: str
    timestamp: str  # ISO format

    model_config = {"from_attributes": True}


@router.post("/adjust", response_model=StockAdjustRead, status_code=201)
def adjust_stock(data: StockAdjustCreate, session: Session = Depends(get_db)):
    """Create a stock adjustment (updates product stock_quantity and logs the change)."""
    if data.quantity_change == 0:
        raise HTTPException(status_code=400, detail="quantity_change cannot be zero")
    if abs(data.quantity_change) > 100_000:
        raise HTTPException(status_code=400, detail="quantity_change exceeds maximum allowed (100,000)")
    product = session.get(Product, data.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    new_qty = product.stock_quantity + data.quantity_change
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment would result in negative stock ({new_qty}). Current: {product.stock_quantity}",
        )
    product.stock_quantity = new_qty
    session.add(product)
    adj = StockAdjustment(
        product_id=data.product_id,
        staff_id=data.staff_id,
        quantity_change=data.quantity_change,
        reason=data.reason,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    session.add(adj)
    session.commit()
    # Broadcast updated stock to all connected terminals
    broadcast_sync(create_event(
        EventType.INVENTORY_UPDATED,
        {"product_id": product.id, "product_name": product.name, "new_quantity": product.stock_quantity},
    ))
    session.refresh(adj)
    return StockAdjustRead(
        id=adj.id,
        product_id=adj.product_id,
        staff_id=adj.staff_id,
        quantity_change=adj.quantity_change,
        reason=adj.reason,
        timestamp=adj.timestamp.isoformat() + "Z",
    )


@router.get("/adjustments", response_model=List[StockAdjustRead])
def list_adjustments(
    product_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    session: Session = Depends(get_db),
):
    """List recent stock adjustments, optionally filtered by product."""
    stmt = select(StockAdjustment).order_by(StockAdjustment.timestamp.desc()).limit(limit)  # type: ignore[attr-defined]
    if product_id is not None:
        stmt = select(StockAdjustment).where(StockAdjustment.product_id == product_id).order_by(StockAdjustment.timestamp.desc()).limit(limit)  # type: ignore[attr-defined]
    rows = session.exec(stmt).all()
    return [
        StockAdjustRead(
            id=r.id,
            product_id=r.product_id,
            staff_id=r.staff_id,
            quantity_change=r.quantity_change,
            reason=r.reason,
            timestamp=r.timestamp.isoformat() + "Z",
        )
        for r in rows
    ]


# Expected column names (case-insensitive, strip); map to Product fields
COLUMN_ALIASES = {
    "item name": "name",
    "name": "name",
    "product name": "name",
    "product_name": "name",
    "barcode": "barcode",
    "code": "barcode",  # API/test compatibility
    "buying price": "price_buying",
    "buyingprice": "price_buying",
    "cost": "price_buying",
    "selling price": "price_selling",
    "sellingprice": "price_selling",
    "price": "price_selling",
    "current stock": "stock_quantity",
    "stock": "stock_quantity",
    "quantity": "stock_quantity",
    "low stock limit": "min_stock_alert",
    "min stock": "min_stock_alert",
    "min_stock_alert": "min_stock_alert",
    "wholesale price": "wholesale_price",
    "wholesaleprice": "wholesale_price",
    "wholesale_price": "wholesale_price",
    "wholesale threshold": "wholesale_threshold",
    "wholesalethreshold": "wholesale_threshold",
    "wholesale_threshold": "wholesale_threshold",
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to Product field names where possible."""
    out = {}
    for c in df.columns:
        key = str(c).strip().lower()
        if key in COLUMN_ALIASES:
            out[COLUMN_ALIASES[key]] = df[c]
        else:
            out[key] = df[c]
    return pd.DataFrame(out)


def _read_upload(file: UploadFile) -> pd.DataFrame:
    """Read .xlsx or .csv into DataFrame."""
    raw = file.file.read()
    if file.filename and file.filename.lower().endswith(".csv"):
        return pd.read_csv(io.BytesIO(raw))
    return pd.read_excel(io.BytesIO(raw))


@router.post("/upload")
def upload_inventory(file: UploadFile = File(...)):
    """
    Bulk upload products from .xlsx or .csv.
    Required columns (any case): Item Name, Barcode, Buying Price, Selling Price, Current Stock, Low Stock Limit.
    If barcode exists: update stock/price; if new: create record.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    if not (
        file.filename.lower().endswith(".xlsx")
        or file.filename.lower().endswith(".csv")
    ):
        raise HTTPException(
            status_code=400,
            detail="File must be .xlsx or .csv",
        )
    try:
        df = _read_upload(file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file: {e}") from e

    df = _normalize_columns(df)
    required = {"name", "barcode", "price_selling"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing columns: {sorted(missing)}. Expected: name, barcode, price_selling (or price); optional: price_buying, stock_quantity, min_stock_alert, wholesale_price, wholesale_threshold",
        )
    # Default price_buying from price_selling if missing (API/test compatibility)
    if "price_buying" not in df.columns:
        df["price_buying"] = df.get("price_selling", 0.0)

    created = 0
    updated = 0
    errors: List[str] = []

    with Session(engine) as session:
        for _, row in df.iterrows():
            try:
                barcode = str(row["barcode"]).strip()
                if not barcode:
                    errors.append("Row missing barcode skipped")
                    continue
                name = str(row["name"]).strip() or "Unknown"
                price_buying = float(row.get("price_buying", row.get("price_selling", 0)))
                price_selling = float(row["price_selling"])
                stock_quantity = int(row.get("stock_quantity", 0))
                min_stock_alert = int(row.get("min_stock_alert", 5))
                _wp = row.get("wholesale_price")
                wholesale_price = None
                if _wp is not None and not (isinstance(_wp, float) and pd.isna(_wp)):
                    try:
                        wholesale_price = float(_wp)
                    except (TypeError, ValueError):
                        pass
                _wt = row.get("wholesale_threshold")
                wholesale_threshold = None
                if _wt is not None and not (isinstance(_wt, float) and pd.isna(_wt)):
                    try:
                        wholesale_threshold = int(_wt)
                    except (TypeError, ValueError):
                        pass

                existing = session.exec(
                    select(Product).where(Product.barcode == barcode)
                ).first()
                if existing:
                    existing.name = name
                    existing.price_buying = price_buying
                    existing.price_selling = price_selling
                    existing.stock_quantity = stock_quantity
                    existing.min_stock_alert = min_stock_alert
                    existing.wholesale_price = wholesale_price
                    existing.wholesale_threshold = wholesale_threshold
                    session.add(existing)
                    updated += 1
                else:
                    product = Product(
                        name=name,
                        barcode=barcode,
                        price_buying=price_buying,
                        price_selling=price_selling,
                        stock_quantity=stock_quantity,
                        min_stock_alert=min_stock_alert,
                        wholesale_price=wholesale_price,
                        wholesale_threshold=wholesale_threshold,
                    )
                    session.add(product)
                    created += 1
            except Exception as e:
                errors.append(f"Row {barcode}: {e}")
                continue
        session.commit()

    return {
        "created": created,
        "updated": updated,
        "errors": errors,
    }
