import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_get_health_endpoint_should_return_status_ok():
    url = f"{BASE_URL}/health"
    try:
        response = requests.get(url, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request to /health endpoint failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    # Optionally validate response content if schema known, assuming JSON with "status": "ok"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert "status" in data, "Response JSON does not contain 'status' key"
    assert data["status"] == "ok", f"Expected status 'ok', got '{data['status']}'"

test_get_health_endpoint_should_return_status_ok()