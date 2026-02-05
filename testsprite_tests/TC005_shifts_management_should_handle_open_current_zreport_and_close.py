import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_shifts_management_should_handle_open_current_zreport_and_close():
    headers = {
        "Content-Type": "application/json"
    }
    shift_id = None
    try:
        # 1. Open a shift: POST /shifts/open
        open_response = requests.post(f"{BASE_URL}/shifts/open", headers=headers, timeout=TIMEOUT)
        assert open_response.status_code == 201, f"Expected 201 Created, got {open_response.status_code}"
        open_data = open_response.json()
        assert "id" in open_data, "Shift ID not in open shift response"
        shift_id = open_data["id"]

        # 2. Get current shift: GET /shifts/current
        current_response = requests.get(f"{BASE_URL}/shifts/current", headers=headers, timeout=TIMEOUT)
        assert current_response.status_code == 200, f"Expected 200 OK for current shift, got {current_response.status_code}"
        current_data = current_response.json()
        assert current_data.get("id") == shift_id, "Current shift id does not match opened shift id"

        # 3. Get z-report for the shift: GET /shifts/{id}/z-report
        z_report_response = requests.get(f"{BASE_URL}/shifts/{shift_id}/z-report", headers=headers, timeout=TIMEOUT)
        assert z_report_response.status_code == 200, f"Expected 200 OK for z-report, got {z_report_response.status_code}"
        z_report_data = z_report_response.json()
        # Assuming there is some report content, check for keys or non-empty dict
        assert isinstance(z_report_data, dict), "Z-report response is not a JSON object"
        assert len(z_report_data) > 0, "Z-report data is empty"

        # 4. Close the shift: POST /shifts/{id}/close (body: closing_actual required)
        close_response = requests.post(
            f"{BASE_URL}/shifts/{shift_id}/close",
            json={"closing_actual": 0.0},
            headers=headers,
            timeout=TIMEOUT,
        )
        assert close_response.status_code == 200, f"Expected 200 OK on closing shift, got {close_response.status_code}"
        close_data = close_response.json()
        assert close_data.get("status") in ["closed", "success"], "Shift did not close successfully"

        # After closing, the current shift should not be this shift
        current_after_close_response = requests.get(f"{BASE_URL}/shifts/current", headers=headers, timeout=TIMEOUT)
        assert current_after_close_response.status_code == 200, f"Expected 200 OK for current shift after close, got {current_after_close_response.status_code}"
        current_after_close_data = current_after_close_response.json()
        # If no current shift, API might return empty or null, so:
        if current_after_close_data:
            assert current_after_close_data.get("id") != shift_id, "Closed shift should no longer be current"

    finally:
        # Cleanup: if shift is still open, try to close it
        if shift_id is not None:
            try:
                requests.post(f"{BASE_URL}/shifts/{shift_id}/close", json={"closing_actual": 0.0}, headers=headers, timeout=TIMEOUT)
            except Exception:
                pass

test_shifts_management_should_handle_open_current_zreport_and_close()
