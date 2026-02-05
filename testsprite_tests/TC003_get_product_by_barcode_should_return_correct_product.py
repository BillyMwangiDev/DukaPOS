import requests
import time

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_get_product_by_barcode_should_return_correct_product():
    # Use unique barcode with timestamp to avoid conflicts
    unique_barcode = f"BAR{int(time.time() * 1000)}"
    product_data = {
        "name": "Test Product Barcode",
        "barcode": unique_barcode,
        "price_sell": 99.99
    }
    headers = {"Content-Type": "application/json"}
    product_id = None

    try:
        # Create a new product to test barcode lookup
        create_resp = requests.post(
            f"{BASE_URL}/products",
            json=product_data,
            headers=headers,
            timeout=TIMEOUT
        )
        assert create_resp.status_code == 201, f"Failed to create product, got {create_resp.status_code}"
        created_product = create_resp.json()
        product_id = created_product.get("id")
        assert product_id is not None, "Created product ID is None"

        barcode = unique_barcode

        # Get product by barcode
        get_resp = requests.get(
            f"{BASE_URL}/products/barcode/{barcode}",
            headers=headers,
            timeout=TIMEOUT
        )
        assert get_resp.status_code == 200, f"Get by barcode failed, got {get_resp.status_code}"
        product = get_resp.json()

        # Validate the returned product details match the created product
        assert product.get("id") == product_id, "Product ID does not match"
        assert product.get("barcode") == barcode, "Barcode does not match"
        assert product.get("name") == product_data["name"], "Product name does not match"
        assert product.get("price_sell") == product_data["price_sell"], "Product price does not match"

        # Test with a non-existing barcode returns 404 or appropriate error
        bad_barcode = "0000000000000"
        bad_resp = requests.get(
            f"{BASE_URL}/products/barcode/{bad_barcode}",
            headers=headers,
            timeout=TIMEOUT
        )
        assert bad_resp.status_code in (404, 400), f"Expected 404 or 400 for non-existing barcode, got {bad_resp.status_code}"

    finally:
        if product_id:
            # Clean up: delete the created product
            requests.delete(
                f"{BASE_URL}/products/{product_id}",
                headers=headers,
                timeout=TIMEOUT
            )

test_get_product_by_barcode_should_return_correct_product()