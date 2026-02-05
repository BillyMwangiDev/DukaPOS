"""
TestSprite API Test: TC013 - Cashier Performance / Accountability Report
Tests the GET /reports/cashier-performance endpoint for tracking cashier sales.
"""
import requests
import time
from datetime import datetime

BASE_URL = "http://localhost:8000"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 10


def test_cashier_performance_report_should_track_accountability():
    """
    Test cashier performance/accountability report:
    1. Get list of cashiers
    2. Create a test product
    3. Create a transaction with items for a cashier
    4. Query cashier performance report
    5. Verify the transaction appears in the report
    6. Test CSV export
    7. Cleanup
    """
    print("TC013: Testing cashier performance/accountability report...")
    
    unique_id = int(time.time() * 1000)
    product_barcode = f"CASHIERTEST{unique_id}"
    created_product_id = None
    created_transaction_id = None
    
    try:
        # Step 1: Get list of cashiers
        print("  Step 1: Getting list of cashiers...")
        resp = requests.get(f"{BASE_URL}/reports/cashiers", timeout=TIMEOUT)
        assert resp.status_code == 200, f"Failed to get cashiers: {resp.text}"
        cashiers = resp.json()
        assert len(cashiers) > 0, "No cashiers found"
        
        # Use the first cashier (admin or any active user)
        test_cashier_id = cashiers[0]["id"]
        test_cashier_name = cashiers[0]["username"]
        print(f"    Found {len(cashiers)} cashiers, using: {test_cashier_name} (ID: {test_cashier_id})")
        
        # Step 2: Create test product
        print("  Step 2: Creating test product...")
        product_data = {
            "name": f"Cashier Test Product {unique_id}",
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
        
        # Step 3: Create transaction for the cashier
        print("  Step 3: Creating transaction for cashier...")
        transaction_data = {
            "cashier_id": test_cashier_id,
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
        
        # Step 4: Query cashier performance report
        print("  Step 4: Testing cashier performance report...")
        today = datetime.utcnow().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/reports/cashier-performance"
            f"?cashier_id={test_cashier_id}&start_date={today}&end_date={today}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Failed to get cashier report: {resp.text}"
        report = resp.json()
        
        # Verify response structure
        assert "cashier_id" in report, "Missing cashier_id"
        assert "cashier_name" in report, "Missing cashier_name"
        assert "summary" in report, "Missing summary"
        assert "shifts" in report, "Missing shifts"
        assert "items" in report, "Missing items"
        
        # Verify summary structure
        summary = report["summary"]
        required_summary_fields = [
            "total_sales", "total_cash", "total_mpesa", "total_credit",
            "total_items_sold", "transaction_count", "average_transaction"
        ]
        for field in required_summary_fields:
            assert field in summary, f"Missing summary field: {field}"
        
        # Verify our transaction is included
        assert report["cashier_id"] == test_cashier_id, "Cashier ID mismatch"
        assert summary["total_sales"] >= 200.0, "Total sales should include our transaction"
        assert summary["total_cash"] >= 200.0, "Cash total should include our transaction"
        print(f"    Report for {report['cashier_name']}: Sales={summary['total_sales']}, Items={summary['total_items_sold']}")
        
        # Step 5: Verify items list
        print("  Step 5: Verifying items in report...")
        assert len(report["items"]) > 0, "Items list should not be empty"
        
        # Check item structure
        item = report["items"][0]
        required_item_fields = [
            "timestamp", "date", "time", "receipt_number", "item_name",
            "quantity", "unit_price", "total_price", "payment_method", "transaction_id"
        ]
        for field in required_item_fields:
            assert field in item, f"Missing item field: {field}"
        print(f"    Found {len(report['items'])} items in report")
        
        # Step 6: Test CSV export
        print("  Step 6: Testing CSV export...")
        resp = requests.get(
            f"{BASE_URL}/reports/cashier-performance/export"
            f"?cashier_id={test_cashier_id}&start_date={today}&end_date={today}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"CSV export failed: {resp.text}"
        assert "text/csv" in resp.headers.get("content-type", ""), "Content-Type should be text/csv"
        
        csv_content = resp.text
        assert "Cashier Performance Report" in csv_content, "CSV should have header"
        assert "Shift ID" in csv_content, "CSV should have shift summary"
        assert "Item Name" in csv_content, "CSV should have item columns"
        print("    CSV export successful")
        
        # Step 7: Test non-existent cashier
        print("  Step 7: Testing error handling for non-existent cashier...")
        resp = requests.get(
            f"{BASE_URL}/reports/cashier-performance"
            f"?cashier_id=99999&start_date={today}&end_date={today}",
            timeout=TIMEOUT
        )
        assert resp.status_code == 404, "Should return 404 for non-existent cashier"
        print("    Non-existent cashier correctly returns 404")
        
        print("TC013: PASSED - All cashier accountability tests successful")
        
    except AssertionError as e:
        print(f"TC013: FAILED - {e}")
        raise
    except Exception as e:
        print(f"TC013: ERROR - {e}")
        raise
    finally:
        # Cleanup
        print("  Cleanup: Removing test data...")
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
    test_cashier_performance_report_should_track_accountability()
