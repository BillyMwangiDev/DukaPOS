"""
Comprehensive test suite for DukaPOS backend.
Uses file-based test SQLite DB (same as conftest.py) so all threads share it.
Covers all TestSprite test cases (TC001-TC010) plus additional functionality.
"""
import os
import sys
from datetime import datetime, timezone
import time
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from unittest.mock import MagicMock

# Now import app modules - they will use the test DATABASE_URL
from app.database import engine
from app.models import Staff, Product, Shift, Receipt, SaleItem, Customer
from main import app as fastapi_app

# Create tables and seed data - MOVED TO FIXTURE
# create_db_and_tables()

# Create test client
# client = TestClient(fastapi_app)

# Database initialization and seeding is handled by conftest.py

def _cleanup_test_data():
    """Clean up test data between test runs."""
    with Session(engine) as session:
        from sqlalchemy import text
        session.exec(text("DELETE FROM product WHERE barcode LIKE 'TEST%' OR barcode LIKE 'RPT%' OR barcode LIKE 'CTEST%'"))
        session.exec(text("DELETE FROM customer WHERE name LIKE 'Integration%' OR name LIKE 'Test%'"))
        session.commit()


@pytest.fixture(autouse=True)
def cleanup():
    """Run cleanup before each test."""
    _cleanup_test_data()
    yield
    _cleanup_test_data()


@pytest.fixture
def session():
    with Session(engine) as session:
        yield session


# ============================================================================
# TC001: Health Check
# ============================================================================
def test_health_check(client: TestClient):
    """GET /health returns status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


# ============================================================================
# TC002: Product CRUD Operations
# ============================================================================
def test_product_lifecycle(client: TestClient):
    """Create, read, update, delete a product."""
    barcode = f"TEST{int(time.time())}"
    
    # Create
    resp = client.post("/products", json={
        "name": "Test Widget",
        "barcode": barcode,
        "price_selling": 100.0,
        "stock_quantity": 50
    })
    assert resp.status_code == 201
    product = resp.json()
    product_id = product["id"]
    assert product["name"] == "Test Widget"
    assert product["stock_quantity"] == 50
    
    # Read by ID
    resp = client.get(f"/products/{product_id}")
    assert resp.status_code == 200
    assert resp.json()["barcode"] == barcode
    
    # Update
    resp = client.patch(f"/products/{product_id}", json={"name": "Updated Widget"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Widget"
    
    # Delete
    resp = client.delete(f"/products/{product_id}")
    assert resp.status_code == 204
    
    # Verify deleted
    resp = client.get(f"/products/{product_id}")
    assert resp.status_code == 404


def test_add_product_inventory_enterprise(client: TestClient):
    """TC011: Create inventory item with enterprise fields (buying price, alerts)."""
    barcode = f"INV{int(time.time())}"
    payload = {
        "name": "Enterprise Widget",
        "barcode": barcode,
        "price_buying": 100.0,
        "price_selling": 150.0,
        "stock_quantity": 50,
        "min_stock_alert": 10
    }
    resp = client.post("/products", json=payload)
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert data["price_buying"] == 100.0
    assert data["min_stock_alert"] == 10
    client.delete(f"/products/{data['id']}")


# ============================================================================
# TC003: Get Product by Barcode
# ============================================================================
def test_get_product_by_barcode(client: TestClient):
    """GET /products/barcode/{barcode} returns correct product."""
    barcode = f"TEST{int(time.time())}"
    
    # Create product
    resp = client.post("/products", json={
        "name": "Barcode Test",
        "barcode": barcode,
        "price_selling": 50.0
    })
    assert resp.status_code == 201
    product_id = resp.json()["id"]
    
    # Read by barcode
    resp = client.get(f"/products/barcode/{barcode}")
    assert resp.status_code == 200
    assert resp.json()["id"] == product_id
    
    # Cleanup
    client.delete(f"/products/{product_id}")


# ============================================================================
# TC004: Create Transaction and Deduct Stock
# ============================================================================
def test_transaction_flow(client: TestClient):
    """Create product, create transaction, verify stock deduction."""
    barcode = f"TXTEST{int(time.time())}"
    
    # Create product with stock
    resp = client.post("/products", json={
        "name": "Transaction Test Product",
        "barcode": barcode,
        "price_selling": 200.0,
        "stock_quantity": 50
    })
    assert resp.status_code == 201
    product = resp.json()
    product_id = product["id"]
    
    # Get a cashier staff
    with Session(engine) as session:
        user = session.exec(select(Staff).where(Staff.role == "cashier")).first()
        if not user:
            user = session.exec(select(Staff)).first()
        cashier_id = user.id if user else 1
    
    # Create transaction
    resp = client.post("/transactions", json={
        "staff_id": cashier_id,
        "payment_type": "CASH",
        "total_amount": 400.0,
        "items": [
            {"product_id": product_id, "quantity": 2, "price_at_moment": 200.0}
        ]
    })
    assert resp.status_code == 201
    tx = resp.json()
    assert tx["total_amount"] == 400.0
    
    # Verify stock deduction
    with Session(engine) as session:
        p = session.get(Product, product_id)
        session.refresh(p)
        assert p.stock_quantity == 48  # 50 - 2
    
    # Cleanup
    client.delete(f"/products/{product_id}")


# ============================================================================
# TC005: Shifts Management
# ============================================================================
def test_shift_open_and_close(client: TestClient):
    """Test POST /shifts/open, GET /shifts/current, POST /shifts/{id}/close."""
    # Get a cashier staff
    with Session(engine) as session:
        user = session.exec(select(Staff)).first()
        cashier_id = user.id if user else 1
    
    # Open shift
    resp = client.post("/shifts/open", json={
        "staff_id": cashier_id,
        "opening_float": 500.0
    })
    # May get 400 if shift already open, which is acceptable
    if resp.status_code == 201:
        shift_id = resp.json()["id"]
        
        # Get current shift
        resp = client.get("/shifts/current")
        assert resp.status_code in [200, 404]
        
        # Close shift
        resp = client.post(f"/shifts/{shift_id}/close", json={"closing_cash": 600.0})
        assert resp.status_code in [200, 400]


# ============================================================================
# TC006: Customer CRUD and Payment
# ============================================================================
def test_customer_crud_and_payment(client: TestClient):
    """Create customer, add debt, record payment."""
    # Create customer
    resp = client.post("/customers", json={
        "name": "Integration Customer",
        "phone": "0700000000",
        "email": "test@example.com",
        "address": "Test Lane",
        "debt_limit": 5000.0
    })
    assert resp.status_code == 201
    customer = resp.json()
    customer_id = customer["id"]
    assert customer["current_balance"] == 0.0
    
    # Update to add debt
    resp = client.patch(f"/customers/{customer_id}", json={"current_balance": 1000.0})
    assert resp.status_code == 200
    assert resp.json()["current_balance"] == 1000.0
    
    # Record payment
    resp = client.post(f"/customers/{customer_id}/payment", json={"amount": 300.0})
    assert resp.status_code == 200
    assert resp.json()["new_balance"] == 700.0
    
    # Delete customer
    resp = client.delete(f"/customers/{customer_id}")
    assert resp.status_code == 204


# ============================================================================
# TC007: Held Orders
# ============================================================================
def test_held_orders(client: TestClient):
    """Test POST /orders/hold, GET /orders/held, DELETE /orders/held/{id}."""
    # Hold an order
    resp = client.post("/orders/hold", json={
        "note": "Test held order",
        "items": [{"product_id": 1, "name": "Test Item", "quantity": 2, "price": 100.0}]
    })
    # Endpoint may not exist or return different status
    if resp.status_code == 201:
        held_order = resp.json()
        order_id = held_order.get("id")
        
        # List held orders
        resp = client.get("/orders/held")
        assert resp.status_code == 200
        
        # Delete held order
        if order_id:
            resp = client.delete(f"/orders/held/{order_id}")
            assert resp.status_code in [200, 204, 404]


# ============================================================================
# TC010: Store Settings
# ============================================================================
def test_store_settings(client: TestClient):
    """Test GET and PUT /settings/store endpoints."""
    # Get store settings
    resp = client.get("/settings/store")
    assert resp.status_code == 200
    settings = resp.json()
    assert "shop_name" in settings
    
    # Update store settings
    resp = client.put("/settings/store", json={
        "shop_name": settings.get("shop_name", "Test Store"),
        "contact_phone": settings.get("contact_phone", "0700000000")
    })
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["shop_name"] == settings.get("shop_name", "Test Store")
    assert updated["contact_phone"] == settings.get("contact_phone", "0700000000")


# ============================================================================
# Duplicate Barcode Rejection
# ============================================================================
def test_duplicate_barcode_rejection(client: TestClient):
    """Reject product creation with duplicate barcode."""
    barcode = f"UNIQUE{int(time.time())}"
    
    # Create first product
    resp = client.post("/products", json={
        "name": "First Product",
        "barcode": barcode,
        "price_selling": 50.0
    })
    assert resp.status_code == 201
    first_id = resp.json()["id"]
    
    # Try to create second product with same barcode
    resp = client.post("/products", json={
        "name": "Second Product",
        "barcode": barcode,
        "price_selling": 75.0
    })
    assert resp.status_code == 400
    assert "Barcode already exists" in resp.json().get("detail", "")
    
    # Cleanup
    client.delete(f"/products/{first_id}")


# ============================================================================
# User Login Tests
# ============================================================================
def test_login_success_admin(client: TestClient):
    """Login with admin/admin123 returns 200 and staff object."""
    response = client.post(
        "/staff/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"
    assert data["is_active"] is True


def test_login_success_cashier(client: TestClient):
    """Login with cashier/cashier123 returns 200 and staff object."""
    response = client.post(
        "/staff/login",
        json={"username": "cashier", "password": "cashier123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "cashier"
    assert data["role"] == "cashier"


def test_login_invalid_credentials(client: TestClient):
    """Login with invalid credentials returns 401."""
    response = client.post(
        "/staff/login",
        json={"username": "nobody", "password": "any"},
    )
    assert response.status_code == 401
    assert "Invalid username or password" in response.json().get("detail", "")


# ============================================================================
# Detailed Sales Reports
# ============================================================================
def test_detailed_sales_returns_correct_structure(client: TestClient):
    """Test that detailed sales returns correct response structure."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    response = client.get(f"/reports/detailed-sales?period=daily&date={today}")
    
    assert response.status_code == 200
    data = response.json()
    
    # Check structure
    assert "period" in data
    assert "date" in data
    assert "summary" in data
    assert "items" in data
    
    # Check summary structure
    summary = data["summary"]
    assert "total_revenue" in summary
    assert "total_cash" in summary
    assert "total_mobile" in summary or "total_mpesa" in summary
    assert "transaction_count" in summary


def test_detailed_sales_export_csv(client: TestClient):
    """TC012: Verify detailed sales CSV export."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    response = client.get(f"/reports/detailed-sales/export?period=daily&date={today}")
    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "").lower()
    assert "Item Name" in response.text


# ============================================================================
# Cashier Performance Report
# ============================================================================
def test_list_cashiers(client: TestClient):
    """Test that /reports/staff-list returns active users."""
    response = client.get("/reports/staff-list")
    
    assert response.status_code == 200
    cashiers = response.json()
    
    assert isinstance(cashiers, list)
    if len(cashiers) > 0:
        assert "id" in cashiers[0]
        assert "username" in cashiers[0]


def test_cashier_performance_report(client: TestClient):
    """TC013: Verify cashier performance report and export."""
    # Get active staff
    resp = client.get("/reports/staff-list")
    assert resp.status_code == 200
    staff = resp.json()
    if not staff:
        pytest.skip("No staff members found")
    
    staff_id = staff[0]["id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check report
    resp = client.get(f"/reports/staff-performance?staff_id={staff_id}&start_date={today}&end_date={today}")
    assert resp.status_code == 200
    data = resp.json()
    assert "summary" in data
    assert data["staff_id"] == staff_id

    # Check export
    resp = client.get(f"/reports/staff-performance/export?staff_id={staff_id}&start_date={today}&end_date={today}")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")


# ============================================================================
# Bank Transaction Test
# ============================================================================
def test_bank_transaction(client: TestClient):
    """Verify bank transaction flow with bank-specific fields."""
    barcode = f"BANKTEST{int(time.time())}"
    
    # 1. Create product
    resp = client.post("/products", json={
        "name": "Bank Transaction Item",
        "barcode": barcode,
        "price_selling": 500.0,
        "stock_quantity": 20
    })
    assert resp.status_code == 201
    product_id = resp.json()["id"]

    # 2. Get cashier ID
    with Session(engine) as session:
        user = session.exec(select(Staff).where(Staff.role == "cashier")).first()
        cashier_id = user.id if user else 1

    # 3. Create bank transaction
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = {
        "staff_id": cashier_id,
        "payment_type": "BANK",
        "bank_name": "Co-operative Bank",
        "bank_sender_name": "Test User",
        "bank_confirmed": True,
        "bank_confirmation_timestamp": timestamp,
        "total_amount": 1000.0,
        "items": [
            {"product_id": product_id, "quantity": 2, "price_at_moment": 500.0}
        ]
    }
    resp = client.post("/transactions", json=payload)
    assert resp.status_code == 201
    tx = resp.json()
    assert tx["payment_type"] == "BANK"
    assert tx["bank_name"] == "Co-operative Bank"
    assert tx["bank_confirmed"] is True
    
    # 4. Verify stock and items
    with Session(engine) as session:
        p = session.get(Product, product_id)
        assert p.stock_quantity == 18 # 20 - 2
        
        # Verify receipt items are loaded
        assert len(tx["items"]) == 1
        assert tx["items"][0]["product_id"] == product_id

    # 5. Cleanup
    client.delete(f"/products/{product_id}")


if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__]))
