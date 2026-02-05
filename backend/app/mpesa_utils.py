"""
M-Pesa Daraja API: OAuth token and STK Push payload.
Env: CONSUMER_KEY, CONSUMER_SECRET. Optional: DARAJA_BASE_URL (sandbox/production).
"""
import base64
import json
import uuid
from datetime import datetime
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from app.config import config

DARAJA_BASE = config(
    "DARAJA_BASE_URL",
    default="https://sandbox.safaricom.co.ke",
)
CONSUMER_KEY = config("CONSUMER_KEY", default="")
CONSUMER_SECRET = config("CONSUMER_SECRET", default="")


def get_access_token() -> str:
    """
    Get OAuth access token (client_credentials).
    Raises ValueError if credentials missing or request fails.
    """
    if not CONSUMER_KEY or not CONSUMER_SECRET:
        raise ValueError("CONSUMER_KEY and CONSUMER_SECRET must be set")
    url = f"{DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials"
    credentials = base64.b64encode(
        f"{CONSUMER_KEY}:{CONSUMER_SECRET}".encode()
    ).decode()
    req = Request(url, method="GET", headers={"Authorization": f"Basic {credentials}"})
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data["access_token"]
    except (HTTPError, URLError, KeyError) as e:
        raise ValueError(f"Daraja OAuth failed: {e}") from e


def build_stk_push_payload(
    phone: str,
    amount: float,
    account_reference: str = "DUKAPOS",
    description: str = "POS Payment",
    callback_url: Optional[str] = None,
    passkey: Optional[str] = None,
    shortcode: Optional[str] = None,
) -> dict:
    """
    Build STK Push request body for Daraja Lipa Na M-Pesa Online.
    Requires: passkey, shortcode (Till/Paybill). Optional: callback_url.
    """
    # Normalize phone: 254XXXXXXXXX
    p = phone.strip().replace(" ", "")
    if p.startswith("0"):
        p = "254" + p[1:]
    elif not p.startswith("254"):
        p = "254" + p
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    # In production you use passkey from Daraja; sandbox has a test passkey.
    passkey = passkey or config("DARAJA_PASSKEY", default="")
    shortcode = shortcode or config("DARAJA_SHORTCODE", default="174379")  # sandbox till
    password_str = shortcode + passkey + timestamp
    password = base64.b64encode(password_str.encode()).decode()
    return {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": round(amount, 2),
        "PartyA": p,
        "PartyB": shortcode,
        "PhoneNumber": p,
        "CallBackURL": callback_url or config("DARAJA_CALLBACK_URL", default="https://example.com/callback"),
        "AccountReference": account_reference,
        "TransactionDesc": description,
    }


def send_stk_push(phone: str, amount: float) -> dict:
    """
    Get token and send STK Push request to Daraja.
    Returns Daraja response JSON or raises ValueError.
    """
    token = get_access_token()
    payload = build_stk_push_payload(phone, amount)
    url = f"{DARAJA_BASE}/mpesa/stkpush/v1/processrequest"
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
            return json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            err_body = e.read().decode()
            return {"error": err_body, "status": e.code}
        except Exception:
            raise ValueError(f"STK Push failed: {e}") from e
    except (URLError, json.JSONDecodeError) as e:
        raise ValueError(f"STK Push failed: {e}") from e


def query_transaction_status(checkout_request_id: str) -> dict:
    """
    Query M-Pesa STK Push transaction status by CheckoutRequestID.
    Daraja: POST /mpesa/stkpushquery/v1/query
    Returns API response (ResultCode, ResultDesc, etc.) for lost callbacks.
    """
    token = get_access_token()
    url = f"{DARAJA_BASE}/mpesa/stkpushquery/v1/query"
    payload = json.dumps({"CheckoutRequestID": checkout_request_id}).encode()
    req = Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            return {"error": e.read().decode(), "status": e.code}
        except Exception:
            raise ValueError(f"Transaction status query failed: {e}") from e
    except (URLError, json.JSONDecodeError) as e:
        raise ValueError(f"Transaction status query failed: {e}") from e
