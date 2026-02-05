import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_create_transaction_should_record_sale_and_deduct_stock():
    # Step 1: Create a product to use in the transaction (since no resource IDs provided)
    product_payload = {
        "name": f"Test Product {uuid.uuid4()}",
        "barcode": f"TEST-{uuid.uuid4()}",
        "price_buying": 80,
        "price_selling": 100,
        "stock": 10,
    }
    product_response = requests.post(
        f"{BASE_URL}/products", json=product_payload, headers=HEADERS, timeout=TIMEOUT
    )
    assert product_response.status_code == 201, f"Product creation failed: {product_response.text}"
    product = product_response.json()
    product_id = product.get("id")
    initial_stock = product.get("stock")
    assert product_id is not None

    # Step 2: Create a shift (open a shift) to have shift_id
    shift_open_payload = {}
    shift_response = requests.post(
        f"{BASE_URL}/shifts/open", json=shift_open_payload, headers=HEADERS, timeout=TIMEOUT
    )
    assert shift_response.status_code == 201, f"Shift open failed: {shift_response.text}"
    shift = shift_response.json()
    shift_id = shift.get("id")
    assert shift_id is not None

    # Step 3: Create a customer to use in the transaction
    customer_payload = {
        "name": f"Test Customer {uuid.uuid4()}",
        "phone": f"+2547{str(uuid.uuid4().int)[:8]}",
    }
    customer_response = requests.post(
        f"{BASE_URL}/customers", json=customer_payload, headers=HEADERS, timeout=TIMEOUT
    )
    assert customer_response.status_code == 201, f"Customer creation failed: {customer_response.text}"
    customer = customer_response.json()
    customer_id = customer.get("id")
    assert customer_id is not None

    # Step 4: Create a user (cashier) to use as cashier_id
    user_payload = {
        "username": f"cashier_{uuid.uuid4()}",
        "password": "password1234",
        "full_name": "Cashier User",
    }
    user_response = requests.post(
        f"{BASE_URL}/users", json=user_payload, headers=HEADERS, timeout=TIMEOUT
    )
    assert user_response.status_code in (200, 201), f"User creation failed: {user_response.text}"
    user = user_response.json()
    cashier_id = user.get("id")
    assert cashier_id is not None

    try:
        # Step 5: Create transaction payload with above IDs and 1 unit of the product
        price_at_sale = float(product.get("price_selling") or product.get("price_sell") or 100)
        transaction_payload = {
            "cashier_id": cashier_id,
            "shift_id": shift_id,
            "customer_id": customer_id,
            "payment_method": "cash",
            "total_amount": price_at_sale * 1,
            "items": [
                {"product_id": product_id, "quantity": 1, "price_at_moment": price_at_sale}
            ],
        }

        # Step 6: Create the transaction
        transaction_response = requests.post(
            f"{BASE_URL}/transactions", json=transaction_payload, headers=HEADERS, timeout=TIMEOUT
        )
        assert transaction_response.status_code == 201, f"Transaction creation failed: {transaction_response.text}"
        transaction = transaction_response.json()
        transaction_id = transaction.get("id")
        assert transaction_id is not None
        assert (transaction.get("payment_method") or "").upper() == "CASH"
        assert transaction.get("total_amount") == price_at_sale
        # API response_model=TransactionRead returns id, payment_method, total_amount, is_return only

        # Step 7: Verify stock is deducted by 1 for the product
        product_after_response = requests.get(
            f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT
        )
        assert product_after_response.status_code == 200, f"Failed to get product after transaction: {product_after_response.text}"
        product_after = product_after_response.json()
        updated_stock = product_after.get("stock")
        assert updated_stock == initial_stock - 1, (
            f"Stock not deducted correctly. Before: {initial_stock}, After: {updated_stock}"
        )

    finally:
        # Cleanup: delete created transaction if possible (no DELETE endpoint mentioned, so skip)

        # Delete user (cashier)
        requests.delete(f"{BASE_URL}/users/{cashier_id}", headers=HEADERS, timeout=TIMEOUT)

        # Delete customer
        requests.delete(f"{BASE_URL}/customers/{customer_id}", headers=HEADERS, timeout=TIMEOUT)

        # Close shift (body: closing_actual required)
        requests.post(f"{BASE_URL}/shifts/{shift_id}/close", json={"closing_actual": 0.0}, headers=HEADERS, timeout=TIMEOUT)

        # Delete product
        requests.delete(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)


test_create_transaction_should_record_sale_and_deduct_stock()
