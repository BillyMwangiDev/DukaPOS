"""Dashboard summary API: today's revenue, M-Pesa vs Cash, net profit."""
from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Receipt, SaleItem, Product

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

class DashboardSummary(BaseModel):
    total_revenue: float
    total_cash: float
    total_mobile: float
    total_credit: float
    net_profit: float
    vat_collected: float
    transaction_count: int

@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary():
    """Today's revenue, Mobile vs Cash breakdown, net profit from (selling - buying) * qty."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    with Session(engine) as session:
        receipts = session.exec(
            select(Receipt).where(Receipt.timestamp >= today_start)
        ).all()
        total_revenue = 0.0
        total_cash = 0.0
        total_mobile = 0.0
        total_credit = 0.0
        for r in receipts:
            total_revenue += r.total_amount
            ptype = r.payment_type.upper()
            if ptype == "CASH":
                total_cash += r.total_amount
            elif ptype == "MOBILE":
                total_mobile += r.total_amount
            elif ptype == "MPESA":
      # Backward compatibility if any strings remain
                total_mobile += r.total_amount
            elif ptype == "CREDIT":
                total_credit += r.total_amount

        vat_collected = total_revenue / 1.16 * 0.16
        net_profit = 0.0
        for r in receipts:
            items = session.exec(
                select(SaleItem).where(SaleItem.receipt_id == r.id)
            ).all()
            for it in items:
                prod = session.get(Product, it.product_id)
                if prod:
                    net_profit += (it.price_at_moment - prod.price_buying) * it.quantity

        return DashboardSummary(
            total_revenue=total_revenue,
            total_cash=total_cash,
            total_mobile=total_mobile,
            total_credit=total_credit,
            net_profit=round(net_profit, 2),
            vat_collected=round(vat_collected, 2),
            transaction_count=len(receipts),
        )
