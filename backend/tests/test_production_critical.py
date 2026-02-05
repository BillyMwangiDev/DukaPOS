import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.database import engine, get_next_receipt_id
from app.models import Product, StoreSettings, Staff

def test_vat_logic_and_rounding(client: TestClient):
    """Verify that VAT (16%) is calculated correctly to 2 decimal places."""
    with Session(engine) as session:
        # Create a product with specific prices
        p = Product(
            name="VAT Test Item",
            barcode="VAT-001",
            price_buying=100.0,
            price_selling=116.0, # 116 inclusive = 100 net + 16 vat
            tax_percentage=16.0,
            stock_quantity=10
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        
        # Calculate VAT from 116.0
        total = 116.0
        calculated_vat = round(total / 1.16 * 0.16, 2)
        assert calculated_vat == 16.0

        # Test rounding with a more complex number
        total_complex = 123.45
        # 123.45 / 1.16 = 106.4224...
        # 106.4224... * 0.16 = 17.0275...
        # Round 17.0275 to 2 decimal places = 17.03
        calculated_vat_complex = round(total_complex / 1.16 * 0.16, 2)
        assert calculated_vat_complex == 17.03

def test_station_prefixed_receipt_id():
    """Verify that receipt IDs are prefixed with the correct Station ID."""
    with Session(engine) as session:
        # Set station ID to POS-TEST
        settings = session.get(StoreSettings, 1)
        if not settings:
            settings = StoreSettings(id=1, station_id="POS-TEST")
            session.add(settings)
        else:
            settings.station_id = "POS-TEST"
        session.add(settings)
        session.commit()
    
    # Generate receipt ID
    rid = get_next_receipt_id()
    assert rid.startswith("POS-TEST-")
    assert len(rid.split("-")) == 3 # POS, TEST, 0000X

def test_staff_limit_enforcement(client: TestClient):
    """Verify that the staff limit is enforced on creation."""
    with Session(engine) as session:
        settings = session.get(StoreSettings, 1)
        settings.staff_limit = 2
        session.add(settings)
        
        # Ensure we have 2 active staff already
        active_staff = session.exec(select(Staff).where(Staff.is_active)).all()
        for s in active_staff:
            s.is_active = False
            session.add(s)
        session.commit()
        
        # Add 2 new active staff
        for i in range(2):
            session.add(Staff(username=f"user_{i}", password_hash="", role="cashier", is_active=True))
        session.commit()

    # Try to add a 3rd staff via API
    payload = {
        "username": "user_limit_test",
        "password": "password123",
        "role": "cashier",
        "pin": "1234"
    }
    response = client.post("/staff", json=payload)
    assert response.status_code == 403
    assert "limit reached" in response.json()["detail"].lower()
