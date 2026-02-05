"""
TestSprite API Test: TC012 - Detailed Sales Report
Tests the GET /reports/detailed-sales endpoint for daily and monthly itemized reports.
Also tests CSV export functionality.
"""
import requests
import time
from datetime import datetime

BASE_URL = "http://localhost:8000"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 10


def test_detailed_sales_report_should_return_itemized_data():
    """
    Test detailed sales report endpoint:
    1. Create a test product
    2. Create a test shift
    3. Create a test transaction with items
    4. Query daily detailed sales
    5. Query monthly detailed sales
    6. Test CSV export
    7. Verify response structure and data
    8. Cleanup test data
    """
    print("TC012: Testing detailed sales report endpoint...")
    
    # Generate unique identifiers
    unique_id = int(time.time() * 1000)
    product_barcode = f"RPTTEST{unique_id}"
    
    created_product_id = None
    created_transaction_id = None
    created_shift_id = None
    
    try:
        # Step 1: Create test product
        print("  Step 1: Creating test product...")
        product_data = {
            "name": f"Report Test Product {unique_id}",
            "barcode": product_barcode,
            "price_buying": 50.0,
            "price_selling": 100.0,
            "stock_quantity": 100,
            "min_stock_alert": 10,
        }
        resp = requests.post(
            f"{BASE_URL}/products",
            json=product_data,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert resp.status_code in (200, 201), f"Failed to create product: {resp.text}"
        created_product_id = resp.json().get("id")
        print(f"    Created product ID: {created_product_id}")
        
        # Step 2: Ensure shift is open
        print("  Step 2: Opening shift...")
        resp = requests.post(
            f"{BASE_URL}/shifts/open?cashier_id=1",
            json={},
            headers=HEADERS,
            timeout=TIMEOUT
        )
        if resp.status_code in (200, 201):
            created_shift_id = resp.json().get("id")
            print(f"    Opened new shift ID: {created_shift_id}")
        else:
            # Shift might already be open, get current
            resp = requests.get(
                f"{BASE_URL}/shifts/current?cashier_id=1",
                timeout=TIMEOUT
            )
            if resp.status_code == 200:
                created_shift_id = resp.json().get("id")
                print(f"    Using existing shift ID: {created_shift_id}")
        
        # Step 3: Create transaction with items
        print("  Step 3: Creating test transaction...")
        transaction_data = {
            "cashier_id": 1,
            "payment_method": "CASH",
            "total_amount": 200.0,
            "items": [
                {
                    "product_id": created_product_id,
                    "quantity": 2,
                    "price_at_moment": 100.0
                }
            ]
        }
        resp = requests.post(
            f"{BASE_URL}/transactions",
            json=transaction_data,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert resp.status_code in (200, 201), f"Failed to create transaction: {resp.text}"
        created_transaction_id = resp.json().get("id")
        print(f"    Created transaction ID: {created_transaction_id}")
        
        # Step 4: Query daily detailed sales
        print("  Step 4: Testing daily detailed sales endpoint...")
        today = datetime.utcnow().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/reports/detailed-sales?period=daily&date={today}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Daily report failed: {resp.text}"
        daily_report = resp.json()
        
        # Verify response structure
        assert "period" in daily_report, "Missing 'period' field"
        assert "date" in daily_report, "Missing 'date' field"
        assert "summary" in daily_report, "Missing 'summary' field"
        assert "items" in daily_report, "Missing 'items' field"
        
        assert daily_report["period"] == "daily", "Period should be 'daily'"
        assert daily_report["date"] == today, f"Date should be {today}"
        
        # Verify summary structure
        summary = daily_report["summary"]
        required_summary_fields = [
            "total_revenue", "total_cash", "total_mpesa", 
            "total_credit", "total_items_sold", "transaction_count"
        ]
        for field in required_summary_fields:
            assert field in summary, f"Missing summary field: {field}"
        
        # Verify our transaction is included
        assert summary["total_revenue"] >= 200.0, "Revenue should include our transaction"
        assert summary["total_cash"] >= 200.0, "Cash total should include our transaction"
        assert summary["transaction_count"] >= 1, "Should have at least 1 transaction"
        print(f"    Daily report: Revenue={summary['total_revenue']}, Transactions={summary['transaction_count']}")
        
        # Verify items structure
        if len(daily_report["items"]) > 0:
            item = daily_report["items"][0]
            required_item_fields = [
                "timestamp", "date", "time", "item_name", "quantity",
                "unit_price", "total_price", "payment_method", "transaction_id"
            ]
            for field in required_item_fields:
                assert field in item, f"Missing item field: {field}"
        print(f"    Daily report has {len(daily_report['items'])} items")
        
        # Step 5: Query monthly detailed sales
        print("  Step 5: Testing monthly detailed sales endpoint...")
        this_month = datetime.utcnow().strftime("%Y-%m")
        resp = requests.get(
            f"{BASE_URL}/reports/detailed-sales?period=monthly&date={this_month}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Monthly report failed: {resp.text}"
        monthly_report = resp.json()
        
        assert monthly_report["period"] == "monthly", "Period should be 'monthly'"
        assert monthly_report["date"] == this_month, f"Date should be {this_month}"
        assert monthly_report["summary"]["total_revenue"] >= 200.0, "Monthly should include our transaction"
        print(f"    Monthly report: Revenue={monthly_report['summary']['total_revenue']}, Items={len(monthly_report['items'])}")
        
        # Step 6: Test CSV export
        print("  Step 6: Testing CSV export endpoint...")
        resp = requests.get(
            f"{BASE_URL}/reports/detailed-sales/export?period=daily&date={today}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"CSV export failed: {resp.text}"
        assert "text/csv" in resp.headers.get("content-type", ""), "Content-Type should be text/csv"
        assert "attachment" in resp.headers.get("content-disposition", ""), "Should have attachment header"
        
        csv_content = resp.text
        assert "Date,Time,Item Name,Quantity,Unit Price,Total Price,Payment Method,Transaction ID" in csv_content, \
            "CSV should have column headers"
        print("    CSV export successful")
        
        # Step 7: Test empty date
        print("  Step 7: Testing empty date response...")
        resp = requests.get(
            f"{BASE_URL}/reports/detailed-sales?period=daily&date=2020-01-01",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Empty date query failed: {resp.text}"
        empty_report = resp.json()
        assert empty_report["summary"]["total_revenue"] == 0.0, "Empty date should have 0 revenue"
        assert len(empty_report["items"]) == 0, "Empty date should have no items"
        print("    Empty date response correct")
        
        print("TC012: PASSED - All detailed sales report tests successful")
        
    except AssertionError as e:
        print(f"TC012: FAILED - {e}")
        raise
    except Exception as e:
        print(f"TC012: ERROR - {e}")
        raise
    finally:
        # Cleanup
        print("  Cleanup: Removing test data...")
        
        # Note: Transactions and items are harder to delete via API
        # In a real test environment, we'd have cleanup endpoints
        
        if created_product_id:
            try:
                requests.delete(
                    f"{BASE_URL}/products/{created_product_id}",
                    timeout=TIMEOUT
                )
                print(f"    Deleted product {created_product_id}")
            except Exception:
                pass


if __name__ == "__main__":
    test_detailed_sales_report_should_return_itemized_data()
