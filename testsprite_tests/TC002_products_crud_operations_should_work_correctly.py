import requests
import time

BASE_URL = "http://localhost:8000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_products_crud_operations_should_work_correctly():
    # Use unique barcode with timestamp to avoid conflicts
    unique_barcode = f"TEST{int(time.time() * 1000)}"
    product_data = {
        "name": "Test Product",
        "description": "A product created during testing",
        "price_buying": 40.0,
        "price_selling": 50.0,
        "barcode": unique_barcode
    }

    updated_product_data = {
        "description": "Updated description",
        "price_buying": 60.0,
        "price_selling": 75.0,
        "stock": 200
    }

    product_id = None
    try:
        # Create a new product - POST /products
        response = requests.post(f"{BASE_URL}/products", json=product_data, headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        created_product = response.json()
        product_id = created_product.get("id")
        assert product_id is not None, "Created product ID should not be None"
        assert created_product.get("name") == product_data["name"]
        assert created_product.get("barcode") == product_data["barcode"]

        # Retrieve the product - GET /products/{id}
        response = requests.get(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        retrieved_product = response.json()
        assert retrieved_product["id"] == product_id
        assert retrieved_product["name"] == product_data["name"]

        # Update the product - PATCH /products/{id}
        response = requests.patch(f"{BASE_URL}/products/{product_id}", json=updated_product_data, headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        updated_product = response.json()
        for key, value in updated_product_data.items():
            assert updated_product.get(key) == value, f"Expected {key} to be {value}"

        # Verify the update persisted - GET /products/{id}
        response = requests.get(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        verified_product = response.json()
        for key, value in updated_product_data.items():
            assert verified_product.get(key) == value, f"Expected {key} to be {value}"

        # Delete the product - DELETE /products/{id}
        response = requests.delete(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 204, f"Expected 204, got {response.status_code}"

        # Verify deletion - GET /products/{id} should return 404
        response = requests.get(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 404, f"Expected 404 after deletion, got {response.status_code}"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    finally:
        if product_id:
            # Attempt cleanup if product still exists
            requests.delete(f"{BASE_URL}/products/{product_id}", headers=HEADERS, timeout=TIMEOUT)


test_products_crud_operations_should_work_correctly()
