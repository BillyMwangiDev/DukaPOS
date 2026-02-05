import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}

def test_held_orders_should_be_held_listed_retrieved_and_deleted():
    held_order_payload = {
        "items": [
            {
                "product_id": 1,
                "quantity": 2
            }
        ],
        "notes": "Test hold order"
    }

    held_order_id = None

    try:
        # Create a held order (POST /orders/hold)
        response_post = requests.post(
            f"{BASE_URL}/orders/hold",
            json=held_order_payload,
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert response_post.status_code == 201, f"Expected status 201 but got {response_post.status_code}"
        post_data = response_post.json()
        assert "id" in post_data, "Response JSON missing 'id' field"
        held_order_id = post_data["id"]

        # List held orders (GET /orders/held?cashier_id=1)
        response_get_list = requests.get(
            f"{BASE_URL}/orders/held",
            params={"cashier_id": 1},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert response_get_list.status_code == 200
        list_data = response_get_list.json()
        assert isinstance(list_data, list)
        assert any(order.get("id") == held_order_id for order in list_data)

        # Retrieve held order by ID (GET /orders/held/{id}?cashier_id=1)
        response_get_single = requests.get(
            f"{BASE_URL}/orders/held/{held_order_id}",
            params={"cashier_id": 1},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert response_get_single.status_code == 200
        single_data = response_get_single.json()
        assert single_data.get("id") == held_order_id
        assert "items" in single_data
        assert "notes" in single_data
        assert single_data["notes"] == held_order_payload["notes"]

    finally:
        if held_order_id is not None:
            # Delete the held order (DELETE /orders/held/{id})
            response_delete = requests.delete(
                f"{BASE_URL}/orders/held/{held_order_id}",
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            assert response_delete.status_code == 200 or response_delete.status_code == 204

test_held_orders_should_be_held_listed_retrieved_and_deleted()