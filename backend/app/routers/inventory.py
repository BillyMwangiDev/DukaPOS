"""Inventory bulk upload (Excel/CSV)."""
import io
from typing import List
from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlmodel import Session, select
import pandas as pd

from app.database import engine
from app.models import Product

router = APIRouter(prefix="/inventory", tags=["inventory"])

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
