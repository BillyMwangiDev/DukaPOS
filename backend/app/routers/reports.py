from datetime import datetime, timezone, timedelta
from io import StringIO, BytesIO
from typing import Optional
from fastapi import APIRouter, Query, Depends
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select, extract
import pandas as pd

from app.database import engine, get_session
from app.models import Receipt, SaleItem, Product, Staff, Shift

router = APIRouter(prefix="/reports", tags=["reports"])


class DailyRow(BaseModel):
    date: str  # YYYY-MM-DD
    revenue: float
    profit: float
    transaction_count: int


class PaymentTypeBreakdown(BaseModel):
    cash: float
    mobile: float
    credit: float


class SalesReportResponse(BaseModel):
    by_day: list[DailyRow]
    by_payment_type: PaymentTypeBreakdown


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
    Sales aggregated by day and by payment type for the given date range.
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
        receipts = session.exec(
            select(Receipt).where(
                Receipt.timestamp >= start,
                Receipt.timestamp <= end,
            )
        ).all()

        by_day: dict[str, dict] = {}
        total_cash = 0.0
        total_mobile = 0.0
        total_credit = 0.0

        for r in receipts:
            day = _date_str(r.timestamp)
            if day not in by_day:
                by_day[day] = {"revenue": 0.0, "profit": 0.0, "count": 0}
            by_day[day]["revenue"] += r.total_amount
            by_day[day]["count"] += 1

            ptype = r.payment_type.upper()
            if ptype == "CASH":
                total_cash += r.total_amount
            elif ptype in ["MOBILE", "MPESA"]:
                total_mobile += r.total_amount
            elif ptype == "CREDIT":
                total_credit += r.total_amount

            items = session.exec(
                select(SaleItem).where(SaleItem.receipt_id == r.id)
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
            by_payment_type=PaymentTypeBreakdown(
                cash=round(total_cash, 2),
                mobile=round(total_mobile, 2),
                credit=round(total_credit, 2),
            ),
        )


@router.get("/export/xlsx")
def export_sales_excel(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    session: Session = Depends(get_session)
):
    """Export sales report as Excel using pandas."""
    try:
        start = _parse_date(start_date)
        end = _parse_date(end_date)
    except:
        start = datetime.now(timezone.utc) - timedelta(days=30)
        end = datetime.now(timezone.utc)
    
    end = end.replace(hour=23, minute=59, second=59)
    
    receipts = session.exec(
        select(Receipt).where(Receipt.timestamp >= start, Receipt.timestamp <= end)
    ).all()
    
    data = []
    for r in receipts:
        data.append({
            "Receipt ID": r.receipt_id,
            "Timestamp": r.timestamp,
            "Total Amount": r.total_amount,
            "Payment Type": r.payment_type,
            "Subtype": r.payment_subtype or "",
            "Ref Code": r.reference_code or "",
            "Station": r.origin_station,
            "Status": r.payment_status
        })
    
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Sales')
    
    output.seek(0)
    filename = f"sales_report_{start_date}_to_{end_date}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/csv", response_class=PlainTextResponse)
def export_sales_csv(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
):
    """Export sales report as CSV."""
    report = get_sales_report(start_date=start_date, end_date=end_date)
    buf = StringIO()
    buf.write("date,revenue,profit,transaction_count\n")
    for row in report.by_day:
        buf.write(f"{row.date},{row.revenue},{row.profit},{row.transaction_count}\n")
    buf.write("\n")
    buf.write("payment_type,amount\n")
    buf.write(f"cash,{report.by_payment_type.cash}\n")
    buf.write(f"mobile,{report.by_payment_type.mobile}\n")
    buf.write(f"credit,{report.by_payment_type.credit}\n")
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=dukapos_sales_{start_date}_{end_date}.csv",
        },
    )


@router.get("/inventory/export/xlsx")
def export_inventory_excel(session: Session = Depends(get_session)):
    """Export current inventory as Excel."""
    products = session.exec(select(Product)).all()
    data = []
    for p in products:
        data.append({
            "ID": p.id,
            "Name": p.name,
            "Barcode": p.barcode,
            "Description": p.description or "",
            "Buying Price": p.price_buying,
            "Selling Price": p.price_selling,
            "Wholesale": p.wholesale_price or 0,
            "Stock": p.stock_quantity,
            "Min Alert": p.min_stock_alert,
        })
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Inventory')
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dukapos_inventory_export.xlsx"}
    )


@router.get("/inventory/export/csv", response_class=PlainTextResponse)
def export_inventory_csv(session: Session = Depends(get_session)):
    """Export current inventory as CSV."""
    products = session.exec(select(Product)).all()
    buf = StringIO()
    buf.write("id,name,barcode,price_buying,price_selling,stock_quantity,min_stock_alert\n")
    for p in products:
        name = f'"{p.name}"' if "," in p.name else p.name
        buf.write(f"{p.id},{name},{p.barcode},{p.price_buying},{p.price_selling},{p.stock_quantity},{p.min_stock_alert}\n")
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=dukapos_inventory_export.csv"}
    )



# ============================================================================
# Detailed Itemized Sales Report
# ============================================================================


class SoldItemDetail(BaseModel):
    """Individual item sold with receipt context."""
    timestamp: str  # ISO format
    date: str  # YYYY-MM-DD
    time: str  # HH:MM:SS
    item_name: str
    quantity: int
    unit_price: float
    total_price: float
    payment_type: str
    receipt_id: str
    db_id: int


class DetailedSalesSummary(BaseModel):
    """Summary totals for the period."""
    total_revenue: float
    total_cash: float
    total_mobile: float
    total_credit: float
    total_items_sold: int
    transaction_count: int


class DetailedSalesResponse(BaseModel):
    """Complete detailed sales report with summary and itemized list."""
    period: str  # "daily" or "monthly"
    date: str  # selected date or month
    summary: DetailedSalesSummary
    items: list[SoldItemDetail]


@router.get("/detailed-sales", response_model=DetailedSalesResponse)
def get_detailed_sales(
    period: str = Query("daily", description="'daily' or 'monthly'"),
    date: str = Query(..., description="YYYY-MM-DD or YYYY-MM"),
):
    """Detailed itemized sales report."""
    with Session(engine) as session:
        if period == "monthly":
            try:
                year = int(date[:4])
                month = int(date[5:7])
            except:
                now = datetime.now(timezone.utc)
                year, month = now.year, now.month

            receipts = session.exec(
                select(Receipt).where(
                    extract("year", Receipt.timestamp) == year,
                    extract("month", Receipt.timestamp) == month,
                    Receipt.payment_status == "COMPLETED",
                ).order_by(Receipt.timestamp)
            ).all()
            date_label = f"{year}-{month:02d}"
        else:
            try:
                selected_date = datetime.strptime(date[:10], "%Y-%m-%d")
            except:
                selected_date = datetime.now(timezone.utc)

            start_day = selected_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_day = selected_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            receipts = session.exec(
                select(Receipt).where(
                    Receipt.timestamp >= start_day,
                    Receipt.timestamp <= end_day,
                    Receipt.payment_status == "COMPLETED",
                ).order_by(Receipt.timestamp)
            ).all()
            date_label = selected_date.strftime("%Y-%m-%d")

        total_cash = 0.0
        total_mobile = 0.0
        total_credit = 0.0
        total_items_sold = 0
        items_list: list[SoldItemDetail] = []

        for r in receipts:
            ptype = r.payment_type.upper()
            if ptype == "CASH":
                total_cash += r.total_amount
            elif ptype in ["MOBILE", "MPESA"]:
                total_mobile += r.total_amount
            elif ptype == "CREDIT":
                total_credit += r.total_amount

            sale_items = session.exec(
                select(SaleItem).where(SaleItem.receipt_id == r.id)
            ).all()

            for it in sale_items:
                product = session.get(Product, it.product_id)
                item_name = product.name if product else f"Product #{it.product_id}"
                total_items_sold += it.quantity

                items_list.append(SoldItemDetail(
                    timestamp=r.timestamp.isoformat() + "Z",
                    date=r.timestamp.strftime("%Y-%m-%d"),
                    time=r.timestamp.strftime("%H:%M:%S"),
                    item_name=item_name,
                    quantity=it.quantity,
                    unit_price=round(it.price_at_moment, 2),
                    total_price=round(it.price_at_moment * it.quantity, 2),
                    payment_type=ptype,
                    receipt_id=r.receipt_id,
                    db_id=r.id or 0,
                ))

        total_revenue = total_cash + total_mobile + total_credit

        return DetailedSalesResponse(
            period=period,
            date=date_label,
            summary=DetailedSalesSummary(
                total_revenue=round(total_revenue, 2),
                total_cash=round(total_cash, 2),
                total_mobile=round(total_mobile, 2),
                total_credit=round(total_credit, 2),
                total_items_sold=total_items_sold,
                transaction_count=len(receipts),
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

    buf.write(f"# Detailed Sales Report - {report.period.title()}: {report.date}\n")
    buf.write(f"# Total Revenue: {report.summary.total_revenue}\n")
    buf.write(f"# Cash: {report.summary.total_cash}, Mobile: {report.summary.total_mobile}, Credit: {report.summary.total_credit}\n")
    buf.write(f"# Total Items Sold: {report.summary.total_items_sold}, Transactions: {report.summary.transaction_count}\n")
    buf.write("\n")

    buf.write("Date,Time,Item Name,Quantity,Unit Price,Total Price,Payment Type,Receipt ID,DB ID\n")

    for item in report.items:
        escaped_name = f'"{item.item_name}"' if "," in item.item_name else item.item_name
        buf.write(
            f"{item.date},{item.time},{escaped_name},{item.quantity},"
            f"{item.unit_price},{item.total_price},{item.payment_type},{item.receipt_id},{item.db_id}\n"
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
    """Individual sale item by a staff member."""
    timestamp: str
    date: str
    time: str
    receipt_id: str
    item_name: str
    quantity: int
    unit_price: float
    total_price: float
    payment_type: str
    db_id: int


class ShiftSummary(BaseModel):
    """Shift summary for cash reconciliation."""
    shift_id: int
    opened_at: str
    closed_at: Optional[str]
    opening_float: float
    expected_cash: float
    total_cash_sales: float
    total_mobile_sales: float
    total_credit_sales: float
    transaction_count: int


class StaffPerformanceSummary(BaseModel):
    """Summary of staff perfromance."""
    staff_id: int
    staff_name: str
    total_sales: float
    total_cash: float
    total_mobile: float
    total_credit: float
    total_items_sold: int
    transaction_count: int
    average_transaction: float


class StaffPerformanceResponse(BaseModel):
    """Complete staff performance report."""
    staff_id: int
    staff_name: str
    period: str
    start_date: str
    end_date: str
    summary: StaffPerformanceSummary
    shifts: list[ShiftSummary]
    items: list[CashierSaleItem]


@router.get("/staff-performance", response_model=StaffPerformanceResponse)
def get_staff_performance(
    staff_id: int = Query(..., description="Staff ID"),
    start_date: str = Query(..., description="YYYY-MM-DD start date"),
    end_date: str = Query(..., description="YYYY-MM-DD end date"),
):
    """Staff accountability and performance report."""
    with Session(engine) as session:
        staff = session.get(Staff, staff_id)
        if not staff:
            raise HTTPException(status_code=404, detail="Staff not found")

        try:
            start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            end = datetime.strptime(end_date[:10], "%Y-%m-%d")
        except:
            start = datetime.now(timezone.utc) - timedelta(days=7)
            end = datetime.now(timezone.utc)

        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = end.replace(hour=23, minute=59, second=59, microsecond=999999)

        receipts = session.exec(
            select(Receipt).where(
                Receipt.staff_id == staff_id,
                Receipt.timestamp >= start,
                Receipt.timestamp <= end,
                Receipt.payment_status == "COMPLETED",
            ).order_by(Receipt.timestamp)
        ).all()

        shifts = session.exec(
            select(Shift).where(
                Shift.cashier_id == staff_id,
                Shift.opened_at >= start,
                Shift.opened_at <= end,
            ).order_by(Shift.opened_at)
        ).all()

        total_cash = 0.0
        total_mobile = 0.0
        total_credit = 0.0
        total_items_sold = 0
        items_list: list[CashierSaleItem] = []

        shift_cash = {}
        shift_mobile = {}
        shift_credit = {}
        shift_tx_count = {}

        for r in receipts:
            amount = r.total_amount
            sid = r.shift_id or 0
            ptype = r.payment_type.upper()

            if ptype == "CASH":
                total_cash += amount
                shift_cash[sid] = shift_cash.get(sid, 0) + amount
            elif ptype in ["MOBILE", "MPESA"]:
                total_mobile += amount
                shift_mobile[sid] = shift_mobile.get(sid, 0) + amount
            elif ptype == "CREDIT":
                total_credit += amount
                shift_credit[sid] = shift_credit.get(sid, 0) + amount

            shift_tx_count[sid] = shift_tx_count.get(sid, 0) + 1

            sale_items = session.exec(
                select(SaleItem).where(SaleItem.receipt_id == r.id)
            ).all()

            for it in sale_items:
                product = session.get(Product, it.product_id)
                it_name = product.name if product else f"Product #{it.product_id}"
                total_items_sold += it.quantity

                items_list.append(CashierSaleItem(
                    timestamp=r.timestamp.isoformat() + "Z",
                    date=r.timestamp.strftime("%Y-%m-%d"),
                    time=r.timestamp.strftime("%H:%M:%S"),
                    receipt_id=r.receipt_id,
                    item_name=it_name,
                    quantity=it.quantity,
                    unit_price=round(it.price_at_moment, 2),
                    total_price=round(it.price_at_moment * it.quantity, 2),
                    payment_type=ptype,
                    db_id=r.id or 0,
                ))

        shift_summaries = []
        for s in shifts:
            sid = s.id or 0
            cash_sales = shift_cash.get(sid, 0)
            expected_cash = s.opening_float + cash_sales

            shift_summaries.append(ShiftSummary(
                shift_id=sid,
                opened_at=s.opened_at.isoformat() + "Z",
                closed_at=s.closed_at.isoformat() + "Z" if s.closed_at else None,
                opening_float=s.opening_float,
                expected_cash=round(expected_cash, 2),
                total_cash_sales=round(cash_sales, 2),
                total_mobile_sales=round(shift_mobile.get(sid, 0), 2),
                total_credit_sales=round(shift_credit.get(sid, 0), 2),
                transaction_count=shift_tx_count.get(sid, 0),
            ))

        total_rev = total_cash + total_mobile + total_credit
        avg_tx = total_rev / len(receipts) if receipts else 0.0

        return StaffPerformanceResponse(
            staff_id=staff_id,
            staff_name=staff.username,
            period="custom",
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            summary=StaffPerformanceSummary(
                staff_id=staff_id,
                staff_name=staff.username,
                total_sales=round(total_rev, 2),
                total_cash=round(total_cash, 2),
                total_mobile=round(total_mobile, 2),
                total_credit=round(total_credit, 2),
                total_items_sold=total_items_sold,
                transaction_count=len(receipts),
                average_transaction=round(avg_tx, 2),
            ),
            shifts=shift_summaries,
            items=items_list,
        )


@router.get("/staff-performance/export", response_class=PlainTextResponse)
def export_staff_performance_csv(
    staff_id: int = Query(..., description="Staff ID"),
    start_date: str = Query(..., description="YYYY-MM-DD start date"),
    end_date: str = Query(..., description="YYYY-MM-DD end date"),
):
    """Export staff performance report as CSV."""
    report = get_staff_performance(staff_id=staff_id, start_date=start_date, end_date=end_date)
    buf = StringIO()
    buf.write(f"# Staff Performance: {report.staff_name}\n")
    buf.write(f"# Sales: {report.summary.total_sales}, Cash: {report.summary.total_cash}, Mobile: {report.summary.total_mobile}\n\n")
    
    buf.write("# Shifts\n")
    buf.write("Shift ID,Opened At,Closed At,Expected Cash,Transactions\n")
    for s in report.shifts:
        buf.write(f"{s.shift_id},{s.opened_at},{s.closed_at or 'Open'},{s.expected_cash},{s.transaction_count}\n")
    buf.write("\n")
    
    buf.write("# Items Sold\n")
    buf.write("Date,Time,Receipt ID,Item,Qty,Price,Type\n")
    for it in report.items:
        buf.write(f"{it.date},{it.time},{it.receipt_id},{it.item_name},{it.quantity},{it.total_price},{it.payment_type}\n")

    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=staff_{staff_id}_report.csv"}
    )


@router.get("/staff-list")
def list_staff_names(session: Session = Depends(get_session)):
    """List staff for dropdowns."""
    staff = session.exec(select(Staff).where(Staff.is_active)).all()
    return [{"id": s.id, "username": s.username, "role": s.role} for s in staff]
