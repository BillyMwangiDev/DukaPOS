"""
TC011: Add Product/Inventory - should create a new product via API
Tests the POST /products endpoint for adding new inventory items.
"""
import requests
import time

BASE_URL = "http://localhost:8000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}


def test_add_product_inventory_should_create_new_product():
    """
    Test adding a new product to inventory via POST /products.
    Verifies:
    1. Product creation returns 201 or 200
    2. Created product has correct fields
    3. Product can be retrieved by ID
    4. Product can be retrieved by barcode
    5. Duplicate barcode returns 400 error
    """
    # Use unique barcode with timestamp to avoid conflicts
    unique_barcode = f"INV{int(time.time() * 1000)}"
    
    product_data = {
        "name": "Test Inventory Item",
        "barcode": unique_barcode,
        "price_buying": 100.0,
        "price_selling": 150.0,
        "stock_quantity": 50,
        "min_stock_alert": 10,
    }
    
    product_id = None
    
    try:
        # 1. Create a new product
        print(f"Creating product with barcode: {unique_barcode}")
        response = requests.post(
            f"{BASE_URL}/products",
            json=product_data,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response.status_code in (200, 201), \
            f"Expected 200 or 201, got {response.status_code}: {response.text}"
        
        created_product = response.json()
        product_id = created_product.get("id")
        assert product_id is not None, "Created product should have an ID"
        print(f"Product created with ID: {product_id}")
        
        # 2. Verify created product has correct fields
        assert created_product.get("name") == product_data["name"], \
            f"Name mismatch: {created_product.get('name')} != {product_data['name']}"
        assert created_product.get("barcode") == product_data["barcode"], \
            f"Barcode mismatch: {created_product.get('barcode')} != {product_data['barcode']}"
        assert created_product.get("price_selling") == product_data["price_selling"], \
            f"Selling price mismatch"
        assert created_product.get("price_buying") == product_data["price_buying"], \
            f"Buying price mismatch"
        assert created_product.get("stock_quantity") == product_data["stock_quantity"], \
            f"Stock quantity mismatch"
        print("Product fields verified correctly")
        
        # 3. Retrieve product by ID
        get_response = requests.get(
            f"{BASE_URL}/products/{product_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert get_response.status_code == 200, \
            f"Failed to get product by ID, got {get_response.status_code}"
        retrieved = get_response.json()
        assert retrieved.get("id") == product_id, "Retrieved product ID mismatch"
        print(f"Product retrieved by ID successfully")
        
        # 4. Retrieve product by barcode
        barcode_response = requests.get(
            f"{BASE_URL}/products/barcode/{unique_barcode}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert barcode_response.status_code == 200, \
            f"Failed to get product by barcode, got {barcode_response.status_code}"
        barcode_product = barcode_response.json()
        assert barcode_product.get("barcode") == unique_barcode, "Barcode mismatch on retrieval"
        print(f"Product retrieved by barcode successfully")
        
        # 5. Try to create duplicate barcode - should fail with 400
        duplicate_response = requests.post(
            f"{BASE_URL}/products",
            json=product_data,  # Same barcode
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert duplicate_response.status_code == 400, \
            f"Duplicate barcode should return 400, got {duplicate_response.status_code}"
        error_detail = duplicate_response.json().get("detail", "")
        assert "barcode" in error_detail.lower() or "exists" in error_detail.lower(), \
            f"Error should mention barcode exists: {error_detail}"
        print("Duplicate barcode correctly rejected with 400")
        
        print("\n[PASS] All add product inventory tests passed!")
        
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"
    
    finally:
        # Cleanup: Delete the test product
        if product_id:
            try:
                delete_response = requests.delete(
                    f"{BASE_URL}/products/{product_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT
                )
                if delete_response.status_code in (200, 204):
                    print(f"Cleanup: Deleted test product {product_id}")
            except Exception as e:
                print(f"Cleanup warning: Could not delete product {product_id}: {e}")


if __name__ == "__main__":
    test_add_product_inventory_should_create_new_product()
