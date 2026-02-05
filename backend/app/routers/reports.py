"""Sales reports API: daily aggregates, payment method breakdown, and detailed itemized reports."""
from datetime import datetime, timezone, timedelta
from io import StringIO
from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlmodel import Session, select, extract

from app.database import engine
from app.models import Transaction, TransactionItem, Product, User, Shift

router = APIRouter(prefix="/reports", tags=["reports"])


class DailyRow(BaseModel):
    date: str  # YYYY-MM-DD
    revenue: float
    profit: float
    transaction_count: int


class PaymentMethodBreakdown(BaseModel):
    cash: float
    mpesa: float
    credit: float


class SalesReportResponse(BaseModel):
    by_day: list[DailyRow]
    by_payment_method: PaymentMethodBreakdown


def _parse_date(s: str) -> datetime:
    """Parse YYYY-MM-DD to UTC midnight."""
    dt = datetime.strptime(s, "%Y-%m-%d")
    return dt.replace(tzinfo=timezone.utc)


def _date_str(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


@router.get("/sales", response_model=SalesReportResponse)
def get_sales_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
):
    """
    Sales aggregated by day and by payment method for the given date range.
    Revenue = sum(total_amount). Profit = sum((price_at_moment - price_buying) * qty) per item.
    """
    try:
        start = _parse_date(start_date)
        end = _parse_date(end_date)
    except ValueError:
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30)
        end = datetime.now(timezone.utc)
    if end < start:
        start, end = end, start
    end = end.replace(hour=23, minute=59, second=59, microsecond=999999)

    with Session(engine) as session:
        txs = session.exec(
            select(Transaction).where(
                Transaction.timestamp >= start,
                Transaction.timestamp <= end,
            )
        ).all()

        by_day: dict[str, dict] = {}
        total_cash = 0.0
        total_mpesa = 0.0
        total_credit = 0.0

        for t in txs:
            day = _date_str(t.timestamp)
            if day not in by_day:
                by_day[day] = {"revenue": 0.0, "profit": 0.0, "count": 0}
            by_day[day]["revenue"] += t.total_amount
            by_day[day]["count"] += 1

            if t.payment_method == "CASH":
                total_cash += t.total_amount
            elif t.payment_method == "MPESA":
                total_mpesa += t.total_amount
            elif t.payment_method == "CREDIT":
                total_credit += t.total_amount

            items = session.exec(
                select(TransactionItem).where(TransactionItem.transaction_id == t.id)
            ).all()
            for it in items:
                prod = session.get(Product, it.product_id)
                if prod:
                    by_day[day]["profit"] += (it.price_at_moment - prod.price_buying) * it.quantity

        days_sorted = sorted(by_day.keys())
        by_day_list = [
            DailyRow(
                date=d,
                revenue=round(by_day[d]["revenue"], 2),
                profit=round(by_day[d]["profit"], 2),
                transaction_count=by_day[d]["count"],
            )
            for d in days_sorted
        ]

        return SalesReportResponse(
            by_day=by_day_list,
            by_payment_method=PaymentMethodBreakdown(
                cash=round(total_cash, 2),
                mpesa=round(total_mpesa, 2),
                credit=round(total_credit, 2),
            ),
        )


@router.get("/export", response_class=PlainTextResponse)
def export_sales_csv(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
):
    """Export sales report as CSV (daily rows + payment method summary)."""
    report = get_sales_report(start_date=start_date, end_date=end_date)
    buf = StringIO()
    buf.write("date,revenue,profit,transaction_count\n")
    for row in report.by_day:
        buf.write(f"{row.date},{row.revenue},{row.profit},{row.transaction_count}\n")
    buf.write("\n")
    buf.write("payment_method,amount\n")
    buf.write(f"cash,{report.by_payment_method.cash}\n")
    buf.write(f"mpesa,{report.by_payment_method.mpesa}\n")
    buf.write(f"credit,{report.by_payment_method.credit}\n")
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=dukapos_sales_{start_date}_{end_date}.csv",
        },
    )


# ============================================================================
# Detailed Itemized Sales Report
# ============================================================================


class SoldItemDetail(BaseModel):
    """Individual item sold with transaction context."""
    timestamp: str  # ISO format
    date: str  # YYYY-MM-DD
    time: str  # HH:MM:SS
    item_name: str
    quantity: int
    unit_price: float
    total_price: float
    payment_method: str
    transaction_id: int


class DetailedSalesSummary(BaseModel):
    """Summary totals for the period."""
    total_revenue: float
    total_cash: float
    total_mpesa: float
    total_credit: float
    total_items_sold: int
    transaction_count: int


class DetailedSalesResponse(BaseModel):
    """Complete detailed sales report with summary and itemized list."""
    period: str  # "daily" or "monthly"
    date: str  # selected date or month (YYYY-MM-DD or YYYY-MM)
    summary: DetailedSalesSummary
    items: list[SoldItemDetail]


@router.get("/detailed-sales", response_model=DetailedSalesResponse)
def get_detailed_sales(
    period: str = Query("daily", description="'daily' or 'monthly'"),
    date: str = Query(..., description="YYYY-MM-DD for daily, YYYY-MM for monthly"),
):
    """
    Detailed itemized sales report for a specific day or month.
    
    Returns:
    - Summary: Total revenue, cash, M-Pesa, credit totals
    - Items: Flat list of every item sold with payment method and timestamp
    """
    with Session(engine) as session:
        # Parse date based on period type
        if period == "monthly":
            # Parse YYYY-MM format
            try:
                if len(date) == 7:  # YYYY-MM
                    year = int(date[:4])
                    month = int(date[5:7])
                else:  # YYYY-MM-DD, extract month
                    dt = datetime.strptime(date[:10], "%Y-%m-%d")
                    year = dt.year
                    month = dt.month
            except (ValueError, IndexError):
                now = datetime.now(timezone.utc)
                year = now.year
                month = now.month
            
            # Query transactions for the month
            txs = session.exec(
                select(Transaction).where(
                    extract("year", Transaction.timestamp) == year,
                    extract("month", Transaction.timestamp) == month,
                    Transaction.payment_status == "COMPLETED",
                ).order_by(Transaction.timestamp)
            ).all()
            date_label = f"{year}-{month:02d}"
        else:
            # Daily: parse YYYY-MM-DD
            try:
                selected_date = datetime.strptime(date[:10], "%Y-%m-%d")
            except (ValueError, IndexError):
                selected_date = datetime.now(timezone.utc)
            
            start_of_day = selected_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = selected_date.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            txs = session.exec(
                select(Transaction).where(
                    Transaction.timestamp >= start_of_day,
                    Transaction.timestamp <= end_of_day,
                    Transaction.payment_status == "COMPLETED",
                ).order_by(Transaction.timestamp)
            ).all()
            date_label = selected_date.strftime("%Y-%m-%d")
        
        # Initialize counters
        total_cash = 0.0
        total_mpesa = 0.0
        total_credit = 0.0
        total_items_sold = 0
        items_list: list[SoldItemDetail] = []
        
        # Process each transaction
        for tx in txs:
            # Accumulate payment method totals
            if tx.payment_method.upper() == "CASH":
                total_cash += tx.total_amount
            elif tx.payment_method.upper() == "MPESA":
                total_mpesa += tx.total_amount
            elif tx.payment_method.upper() == "CREDIT":
                total_credit += tx.total_amount
            
            # Get transaction items
            tx_items = session.exec(
                select(TransactionItem).where(TransactionItem.transaction_id == tx.id)
            ).all()
            
            for item in tx_items:
                # Get product name
                product = session.get(Product, item.product_id)
                item_name = product.name if product else f"Product #{item.product_id}"
                
                total_items_sold += item.quantity
                
                items_list.append(SoldItemDetail(
                    timestamp=tx.timestamp.isoformat() + "Z" if tx.timestamp else "",
                    date=tx.timestamp.strftime("%Y-%m-%d") if tx.timestamp else "",
                    time=tx.timestamp.strftime("%H:%M:%S") if tx.timestamp else "",
                    item_name=item_name,
                    quantity=item.quantity,
                    unit_price=round(item.price_at_moment, 2),
                    total_price=round(item.price_at_moment * item.quantity, 2),
                    payment_method=tx.payment_method.upper(),
                    transaction_id=tx.id or 0,
                ))
        
        total_revenue = total_cash + total_mpesa + total_credit
        
        return DetailedSalesResponse(
            period=period,
            date=date_label,
            summary=DetailedSalesSummary(
                total_revenue=round(total_revenue, 2),
                total_cash=round(total_cash, 2),
                total_mpesa=round(total_mpesa, 2),
                total_credit=round(total_credit, 2),
                total_items_sold=total_items_sold,
                transaction_count=len(txs),
            ),
            items=items_list,
        )


@router.get("/detailed-sales/export", response_class=PlainTextResponse)
def export_detailed_sales_csv(
    period: str = Query("daily", description="'daily' or 'monthly'"),
    date: str = Query(..., description="YYYY-MM-DD for daily, YYYY-MM for monthly"),
):
    """Export detailed itemized sales report as CSV."""
    report = get_detailed_sales(period=period, date=date)
    buf = StringIO()
    
    # Header with summary
    buf.write(f"# Detailed Sales Report - {report.period.title()}: {report.date}\n")
    buf.write(f"# Total Revenue: {report.summary.total_revenue}\n")
    buf.write(f"# Cash: {report.summary.total_cash}, M-Pesa: {report.summary.total_mpesa}, Credit: {report.summary.total_credit}\n")
    buf.write(f"# Total Items Sold: {report.summary.total_items_sold}, Transactions: {report.summary.transaction_count}\n")
    buf.write("\n")
    
    # Column headers
    buf.write("Date,Time,Item Name,Quantity,Unit Price,Total Price,Payment Method,Transaction ID\n")
    
    # Data rows
    for item in report.items:
        # Escape item name in case it contains commas
        escaped_name = f'"{item.item_name}"' if "," in item.item_name else item.item_name
        buf.write(
            f"{item.date},{item.time},{escaped_name},{item.quantity},"
            f"{item.unit_price},{item.total_price},{item.payment_method},{item.transaction_id}\n"
        )
    
    filename = f"dukapos_detailed_sales_{report.period}_{report.date.replace('-', '_')}.csv"
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


# Cashier Performance / Accountability Report
# ============================================================================


class CashierSaleItem(BaseModel):
    """Individual sale item by a cashier."""
    timestamp: str
    date: str
    time: str
    receipt_number: str
    item_name: str
    quantity: int
    unit_price: float
    total_price: float
    payment_method: str
    transaction_id: int


class ShiftSummary(BaseModel):
    """Shift summary for cash reconciliation."""
    shift_id: int
    opened_at: str
    closed_at: Optional[str]
    opening_float: float
    expected_cash: float
    total_cash_sales: float
    total_mpesa_sales: float
    total_credit_sales: float
    transaction_count: int


class CashierPerformanceSummary(BaseModel):
    """Summary of cashier performance."""
    cashier_id: int
    cashier_name: str
    total_sales: float
    total_cash: float
    total_mpesa: float
    total_credit: float
    total_items_sold: int
    transaction_count: int
    average_transaction: float


class CashierPerformanceResponse(BaseModel):
    """Complete cashier performance report."""
    cashier_id: int
    cashier_name: str
    period: str
    start_date: str
    end_date: str
    summary: CashierPerformanceSummary
    shifts: list[ShiftSummary]
    items: list[CashierSaleItem]


def get_cashier_performance(
    cashier_id: int = Query(..., description="Cashier user ID"),
    start_date: str = Query(..., description="YYYY-MM-DD start date"),
    end_date: str = Query(..., description="YYYY-MM-DD end date"),
):
    """
    Cashier accountability and performance report.
    
    Returns:
    - Summary: Total sales, breakdown by payment method
    - Shifts: All shifts worked with expected vs actual cash
    - Items: Every item sold by this cashier
    """
    with Session(engine) as session:
        # Verify cashier exists
        cashier = session.get(User, cashier_id)
        if not cashier:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Cashier not found")
        
        # Parse dates
        try:
            start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            end = datetime.strptime(end_date[:10], "%Y-%m-%d")
        except (ValueError, IndexError):
            start = datetime.now(timezone.utc) - timedelta(days=7)
            end = datetime.now(timezone.utc)
        
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Get all transactions by this cashier in date range
        txs = session.exec(
            select(Transaction).where(
                Transaction.cashier_id == cashier_id,
                Transaction.timestamp >= start,
                Transaction.timestamp <= end,
                Transaction.payment_status == "COMPLETED",
            ).order_by(Transaction.timestamp)
        ).all()
        
        # Get shifts worked by this cashier
        shifts = session.exec(
            select(Shift).where(
                Shift.cashier_id == cashier_id,
                Shift.opened_at >= start,
                Shift.opened_at <= end,
            ).order_by(Shift.opened_at)
        ).all()
        
        # Calculate totals
        total_cash = 0.0
        total_mpesa = 0.0
        total_credit = 0.0
        total_items_sold = 0
        items_list: list[CashierSaleItem] = []
        
        # Track cash per shift for reconciliation
        shift_cash: dict[int, float] = {}
        shift_mpesa: dict[int, float] = {}
        shift_credit: dict[int, float] = {}
        shift_tx_count: dict[int, int] = {}
        
        for tx in txs:
            amount = tx.total_amount
            shift_id = tx.shift_id or 0
            
            if tx.payment_method.upper() == "CASH":
                total_cash += amount
                shift_cash[shift_id] = shift_cash.get(shift_id, 0) + amount
            elif tx.payment_method.upper() == "MPESA":
                total_mpesa += amount
                shift_mpesa[shift_id] = shift_mpesa.get(shift_id, 0) + amount
            elif tx.payment_method.upper() == "CREDIT":
                total_credit += amount
                shift_credit[shift_id] = shift_credit.get(shift_id, 0) + amount
            
            shift_tx_count[shift_id] = shift_tx_count.get(shift_id, 0) + 1
            
            # Get items for this transaction
            tx_items = session.exec(
                select(TransactionItem).where(TransactionItem.transaction_id == tx.id)
            ).all()
            
            for item in tx_items:
                product = session.get(Product, item.product_id)
                item_name = product.name if product else f"Product #{item.product_id}"
                total_items_sold += item.quantity
                
                items_list.append(CashierSaleItem(
                    timestamp=tx.timestamp.isoformat() + "Z" if tx.timestamp else "",
                    date=tx.timestamp.strftime("%Y-%m-%d") if tx.timestamp else "",
                    time=tx.timestamp.strftime("%H:%M:%S") if tx.timestamp else "",
                    receipt_number=tx.invoice_number or f"TX-{tx.id}",
                    item_name=item_name,
                    quantity=item.quantity,
                    unit_price=round(item.price_at_moment, 2),
                    total_price=round(item.price_at_moment * item.quantity, 2),
                    payment_method=tx.payment_method.upper(),
                    transaction_id=tx.id or 0,
                ))
        
        # Build shift summaries
        shift_summaries: list[ShiftSummary] = []
        for shift in shifts:
            sid = shift.id or 0
            cash_sales = shift_cash.get(sid, 0)
            expected_cash = shift.opening_float + cash_sales
            
            shift_summaries.append(ShiftSummary(
                shift_id=sid,
                opened_at=shift.opened_at.isoformat() + "Z" if shift.opened_at else "",
                closed_at=shift.closed_at.isoformat() + "Z" if shift.closed_at else None,
                opening_float=shift.opening_float,
                expected_cash=round(expected_cash, 2),
                total_cash_sales=round(cash_sales, 2),
                total_mpesa_sales=round(shift_mpesa.get(sid, 0), 2),
                total_credit_sales=round(shift_credit.get(sid, 0), 2),
                transaction_count=shift_tx_count.get(sid, 0),
            ))
        
        total_revenue = total_cash + total_mpesa + total_credit
        avg_transaction = total_revenue / len(txs) if txs else 0.0
        
        return CashierPerformanceResponse(
            cashier_id=cashier_id,
            cashier_name=cashier.username,
            period="custom",
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            summary=CashierPerformanceSummary(
                cashier_id=cashier_id,
                cashier_name=cashier.username,
                total_sales=round(total_revenue, 2),
                total_cash=round(total_cash, 2),
                total_mpesa=round(total_mpesa, 2),
                total_credit=round(total_credit, 2),
                total_items_sold=total_items_sold,
                transaction_count=len(txs),
                average_transaction=round(avg_transaction, 2),
            ),
            shifts=shift_summaries,
            items=items_list,
        )


@router.get("/cashier-performance/export", response_class=PlainTextResponse)
def export_cashier_performance_csv(
    cashier_id: int = Query(..., description="Cashier user ID"),
    start_date: str = Query(..., description="YYYY-MM-DD start date"),
    end_date: str = Query(..., description="YYYY-MM-DD end date"),
):
    """Export cashier performance report as CSV."""
    report = get_cashier_performance(
        cashier_id=cashier_id,
        start_date=start_date,
        end_date=end_date,
    )
    buf = StringIO()
    
    # Summary header
    buf.write(f"# Cashier Performance Report: {report.cashier_name}\n")
    buf.write(f"# Period: {report.start_date} to {report.end_date}\n")
    buf.write(f"# Total Sales: {report.summary.total_sales}\n")
    buf.write(f"# Cash: {report.summary.total_cash}, M-Pesa: {report.summary.total_mpesa}, Credit: {report.summary.total_credit}\n")
    buf.write(f"# Transactions: {report.summary.transaction_count}, Items Sold: {report.summary.total_items_sold}\n")
    buf.write("\n")
    
    # Shift summary
    buf.write("# Shift Summaries\n")
    buf.write("Shift ID,Opened At,Closed At,Opening Float,Expected Cash,Cash Sales,M-Pesa Sales,Credit Sales,Transactions\n")
    for shift in report.shifts:
        buf.write(
            f"{shift.shift_id},{shift.opened_at},{shift.closed_at or 'Open'},"
            f"{shift.opening_float},{shift.expected_cash},{shift.total_cash_sales},"
            f"{shift.total_mpesa_sales},{shift.total_credit_sales},{shift.transaction_count}\n"
        )
    buf.write("\n")
    
    # Item details
    buf.write("# Itemized Sales\n")
    buf.write("Date,Time,Receipt,Item Name,Quantity,Unit Price,Total,Payment Method,Transaction ID\n")
    for item in report.items:
        escaped_name = f'"{item.item_name}"' if "," in item.item_name else item.item_name
        buf.write(
            f"{item.date},{item.time},{item.receipt_number},{escaped_name},{item.quantity},"
            f"{item.unit_price},{item.total_price},{item.payment_method},{item.transaction_id}\n"
        )
    
    filename = f"dukapos_cashier_{report.cashier_id}_{report.start_date}_{report.end_date}.csv"
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )


@router.get("/cashiers")
def list_cashiers():
    """List all active cashiers for the audit dropdown."""
    with Session(engine) as session:
        users = session.exec(
            select(User).where(User.is_active)
        ).all()
        return [
            {"id": u.id, "username": u.username, "role": u.role}
            for u in users
        ]
