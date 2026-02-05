import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30


def test_print_receipt_and_kick_drawer_should_trigger_printing_actions():
    # Test /print/receipt with empty JSON payload
    try:
        response_receipt = requests.post(
            f"{BASE_URL}/print/receipt",
            json={},
            timeout=TIMEOUT
        )
        response_receipt.raise_for_status()
        assert response_receipt.status_code == 200, f"Expected 200 OK, got {response_receipt.status_code}"
        json_receipt = response_receipt.json()
        assert isinstance(json_receipt, dict), "Response JSON for receipt print should be a dictionary"
        assert "status" in json_receipt, "Receipt print response missing 'status' field"
    except requests.RequestException as e:
        assert False, f"Request to /print/receipt failed: {e}"

    # Test /print/kick-drawer with empty JSON payload
    try:
        response_kick = requests.post(
            f"{BASE_URL}/print/kick-drawer",
            json={},
            timeout=TIMEOUT
        )
        response_kick.raise_for_status()
        assert response_kick.status_code == 200, f"Expected 200 OK, got {response_kick.status_code}"
        json_kick = response_kick.json()
        assert isinstance(json_kick, dict), "Response JSON for kick drawer should be a dictionary"
        assert "status" in json_kick, "Kick drawer response missing 'status' field"
    except requests.RequestException as e:
        assert False, f"Request to /print/kick-drawer failed: {e}"


test_print_receipt_and_kick_drawer_should_trigger_printing_actions()
