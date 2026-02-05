import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30


def store_settings_should_be_retrieved_and_updated():
    url = f"{BASE_URL}/settings/store"
    headers = {
        "Content-Type": "application/json"
    }

    # Step 1: GET the current store settings
    try:
        response_get = requests.get(url, headers=headers, timeout=TIMEOUT)
        response_get.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /settings/store request failed: {e}"

    store_settings = response_get.json()
    assert isinstance(store_settings, dict), "Response is not a JSON object"
    # Basic sanity check: store settings should have some keys (we assume any keys)
    assert len(store_settings) > 0, "Store settings appears empty"

    # Step 2: Prepare an update payload
    # We will update a simple field or if no documented schema, toggle a boolean or append a suffix to a store name.
    # Since the PRD doesn't specify exact store settings schema, try to update any string field or add a dummy field
    update_payload = store_settings.copy()

    # Find a string field to modify or add a new field "_test_update"
    updated = False
    for key, value in update_payload.items():
        if isinstance(value, str):
            update_payload[key] = value + "_test"
            updated = True
            break
    if not updated:
        # If no string field, add a new test field
        update_payload["_test_update"] = "updated"

    # Step 3: PUT updated settings
    try:
        response_put = requests.put(url, json=update_payload, headers=headers, timeout=TIMEOUT)
        response_put.raise_for_status()
    except requests.RequestException as e:
        assert False, f"PUT /settings/store request failed: {e}"

    updated_settings = response_put.json()
    assert isinstance(updated_settings, dict), "Response to PUT is not a JSON object"

    # Step 4: Confirm the updates applied by comparing fields
    for key, val in update_payload.items():
        assert key in updated_settings, f"Updated key {key} missing in response"
        assert updated_settings[key] == val, f"Value for '{key}' was not updated correctly"

    # Step 5: Cleanup - Restore original settings
    try:
        restore_response = requests.put(url, json=store_settings, headers=headers, timeout=TIMEOUT)
        restore_response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Failed to restore original store settings: {e}"


store_settings_should_be_retrieved_and_updated()