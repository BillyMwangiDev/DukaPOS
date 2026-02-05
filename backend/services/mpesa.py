"""
M-Pesa STK Push Status Query service.
Calls Daraja STK Push Query API and returns structured result.
"""
import base64
import json
from datetime import datetime
from typing import Any, Tuple

from app.config import config
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DARAJA_BASE = config("DARAJA_BASE_URL", default="https://sandbox.safaricom.co.ke")
CONSUMER_KEY = config("CONSUMER_KEY", default="")
CONSUMER_SECRET = config("CONSUMER_SECRET", default="")
DARAJA_PASSKEY = config("DARAJA_PASSKEY", default="")
DARAJA_SHORTCODE = config("DARAJA_SHORTCODE", default="174379")


def _get_access_token() -> str:
    """Generate Daraja OAuth access token."""
    if not CONSUMER_KEY or not CONSUMER_SECRET:
        raise ValueError("CONSUMER_KEY and CONSUMER_SECRET must be set")
    import base64 as b64
    url = f"{DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials"
    credentials = b64.b64encode(
        f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()
    ).decode()
    req = Request(url, method="GET", headers={"Authorization": f"Basic {credentials}"})
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
        return data["access_token"]


def _build_stk_query_password() -> Tuple[str, str]:
    """Build password (Base64(Shortcode + Passkey + Timestamp)) and timestamp."""
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    password_str = DARAJA_SHORTCODE + DARAJA_PASSKEY + timestamp
    password = base64.b64encode(password_str.encode()).decode()
    return password, timestamp


def query_stk_status(checkout_id: str) -> dict[str, Any]:
    """
    Query M-Pesa STK Push status by CheckoutRequestID.

    1. Generate Daraja access_token.
    2. Generate password using Shortcode + Passkey + Timestamp.
    3. POST to M-Pesa STK Query endpoint.
    4. Parse response. If ResultCode == "0", return success with MpesaReceiptNumber.

    Returns:
        On success: {"success": True, "mpesa_receipt_number": str, "result_desc": str}
        On pending/failure: {"success": False, "result_code": str, "result_desc": str}
    """
    checkout_id = (checkout_id or "").strip()
    if not checkout_id:
        return {"success": False, "result_code": "INVALID", "result_desc": "checkout_id required"}

    token = _get_access_token()
    password, timestamp = _build_stk_query_password()

    url = f"{DARAJA_BASE}/mpesa/stkpushquery/v1/query"
    payload = {
        "CheckoutRequestID": checkout_id,
        "BusinessShortCode": DARAJA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
    }
    body = json.dumps(payload).encode()
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            err_body = e.read().decode()
            return {
                "success": False,
                "result_code": str(e.code),
                "result_desc": err_body or e.reason,
            }
        except Exception:
            return {
                "success": False,
                "result_code": "HTTP_ERROR",
                "result_desc": str(e),
            }
    except (URLError, json.JSONDecodeError) as e:
        return {
            "success": False,
            "result_code": "ERROR",
            "result_desc": str(e),
        }

    result_code = str(data.get("ResultCode", ""))
    result_desc = str(data.get("ResultDesc", ""))

    if result_code == "0":
        mpesa_receipt_number = ""
        callback_meta = data.get("CallbackMetadata") or data.get("ResultParameters")
        if isinstance(callback_meta, dict):
            items = callback_meta.get("Item", callback_meta.get("Items", []))
            for item in items:
                if isinstance(item, dict) and item.get("Name") == "MpesaReceiptNumber":
                    mpesa_receipt_number = str(item.get("Value", ""))
                    break
        return {
            "success": True,
            "mpesa_receipt_number": mpesa_receipt_number,
            "result_desc": result_desc,
        }

    return {
        "success": False,
        "result_code": result_code,
        "result_desc": result_desc,
    }
