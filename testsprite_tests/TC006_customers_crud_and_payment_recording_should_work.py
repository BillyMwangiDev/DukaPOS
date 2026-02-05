import requests

BASE_URL = "http://localhost:8000"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30


def customers_crud_and_payment_recording_should_work():
    customer_url = f"{BASE_URL}/customers"
    created_customer_id = None

    try:
        # 1. POST /customers - create a new customer
        create_payload = {
            "name": "Test Customer",
            "email": "testcustomer@example.com",
            "phone": "+254700000000",
            "address": "123 Test Street, Nairobi"
        }
        create_resp = requests.post(customer_url, json=create_payload, headers=HEADERS, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Expected 201 Created, got {create_resp.status_code}"
        created_customer = create_resp.json()
        assert "id" in created_customer, "Created customer response missing 'id'"
        created_customer_id = created_customer["id"]
        assert created_customer["name"] == create_payload["name"]

        # 2. GET /customers - list customers (should include the created one)
        get_resp = requests.get(customer_url, headers=HEADERS, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Expected 200 OK, got {get_resp.status_code}"
        customers_list = get_resp.json()
        assert isinstance(customers_list, list), "Expected a list of customers"
        assert any(c.get("id") == created_customer_id for c in customers_list), "Created customer not found in list"

        # 3. PATCH /customers/{id} - update the created customer
        patch_url = f"{customer_url}/{created_customer_id}"
        patch_payload = {
            "phone": "+254711111111",
            "address": "456 Updated Street, Nairobi"
        }
        patch_resp = requests.patch(patch_url, json=patch_payload, headers=HEADERS, timeout=TIMEOUT)
        assert patch_resp.status_code == 200, f"Expected 200 OK on patch, got {patch_resp.status_code}"
        updated_customer = patch_resp.json()
        assert updated_customer["id"] == created_customer_id
        assert updated_customer["phone"] == patch_payload["phone"]
        assert updated_customer["address"] == patch_payload["address"]

        # 4. POST /customers/{id}/payment - record a payment for the customer
        payment_url = f"{customer_url}/{created_customer_id}/payment"
        payment_payload = {
            "amount": 1500.0,
            "payment_method": "cash",
            "notes": "Payment for credit account"
        }
        payment_resp = requests.post(payment_url, json=payment_payload, headers=HEADERS, timeout=TIMEOUT)
        assert payment_resp.status_code in (200, 201), f"Expected 200 or 201 on payment, got {payment_resp.status_code}"
        payment_record = payment_resp.json()
        assert "payment_id" in payment_record or "id" in payment_record, "Payment response missing payment id"
        assert payment_record.get("amount", 0) == payment_payload["amount"]

    finally:
        pass


customers_crud_and_payment_recording_should_work()
