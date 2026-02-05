"""Products CRUD API."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from pydantic import BaseModel, Field, computed_field

from app.models import Product

router = APIRouter(prefix="/products", tags=["products"])


class ProductCreate(BaseModel):
    """Accept price_sell as alias for price_selling; price_buying optional for test/API compatibility."""
    name: str
    barcode: str
    description: Optional[str] = None
    price_buying: float = 0.0
    price_selling: float = Field(0.0, alias="price_sell")  # alias for TestSprite / API compatibility
    wholesale_price: Optional[float] = None
    wholesale_threshold: Optional[int] = None
    tax_percentage: float = 16.0
    stock_quantity: int = 0
    min_stock_alert: int = 5

    model_config = {"populate_by_name": True}


class ProductRead(BaseModel):
    id: int
    name: str
    barcode: str
    description: Optional[str] = None
    price_buying: float
    price_selling: float
    wholesale_price: Optional[float] = None
    wholesale_threshold: Optional[int] = None
    tax_percentage: float
    stock_quantity: int
    min_stock_alert: int

    @computed_field
    @property
    def stock(self) -> int:
        """Alias for stock_quantity (API/test compatibility)."""
        return self.stock_quantity

    @computed_field
    @property
    def price_sell(self) -> float:
        """Alias for price_selling (API/test compatibility)."""
        return self.price_selling

    model_config = {"from_attributes": True}


class ProductUpdate(BaseModel):
    """Accept stock as alias for stock_quantity."""
    name: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    price_buying: Optional[float] = None
    price_selling: Optional[float] = None
    wholesale_price: Optional[float] = None
    wholesale_threshold: Optional[int] = None
    tax_percentage: Optional[float] = None
    stock_quantity: Optional[int] = Field(None, alias="stock")
    min_stock_alert: Optional[int] = None

    model_config = {"populate_by_name": True}


def get_db():
    from app.database import engine
    from sqlmodel import Session
    with Session(engine) as session:
        yield session


@router.get("", response_model=List[ProductRead])
def list_products(
    q: Optional[str] = Query(None, description="Search by name or barcode"),
    session: Session = Depends(get_db),
):
    """List products, optionally filtered by search."""
    statement = select(Product)
    if q:
        q = q.strip()
        statement = statement.where(
            (Product.name.ilike(f"%{q}%")) | (Product.barcode == q)
        )
    products = session.exec(statement).all()
    return list(products)


@router.get("/barcode/{barcode}", response_model=ProductRead)
def get_by_barcode(barcode: str, session: Session = Depends(get_db)):
    """Get product by barcode (for scanner)."""
    product = session.exec(select(Product).where(Product.barcode == barcode)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}", response_model=ProductRead)
def get_product(product_id: int, session: Session = Depends(get_db)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("", response_model=ProductRead, status_code=201)
def create_product(data: ProductCreate, session: Session = Depends(get_db)):
    existing = session.exec(select(Product).where(Product.barcode == data.barcode)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Barcode already exists")
    product = Product(**data.model_dump())
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int, data: ProductUpdate, session: Session = Depends(get_db)
):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, session: Session = Depends(get_db)):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    session.delete(product)
    session.commit()
    return None
