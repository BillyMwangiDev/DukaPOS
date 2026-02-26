"""
M-Pesa Daraja API: OAuth token, STK Push, and STK Query.

Env variables (MPESA_* preferred; DARAJA_* / bare names accepted as fallbacks):
  MPESA_CONSUMER_KEY      (or CONSUMER_KEY)
  MPESA_CONSUMER_SECRET   (or CONSUMER_SECRET)
  MPESA_PASSKEY           (or DARAJA_PASSKEY)
  MPESA_SHORTCODE         (or DARAJA_SHORTCODE, default: 174379)
  MPESA_CALLBACK_URL      (or DARAJA_CALLBACK_URL)
  MPESA_ENV               sandbox | production  (sets Daraja base URL)
  MPESA_TRANSACTION_TYPE  CustomerPayBillOnline | CustomerBuyGoodsOnline
"""
import base64
import json
import re
import time
from datetime import datetime
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Kenyan M-Pesa numbers after normalisation: 2547XXXXXXXX or 2541XXXXXXXX
_KENYA_PHONE_RE = re.compile(r"^254[17]\d{8}$")

from app.config import config  # noqa: E402


# ---------------------------------------------------------------------------
# Daraja base URL: resolve from MPESA_ENV or explicit DARAJA_BASE_URL
# ---------------------------------------------------------------------------
def _get_daraja_base() -> str:
    env = config("MPESA_ENV", default="").strip().lower()
    if env == "production":
        return "https://api.safaricom.co.ke"
    explicit = config("DARAJA_BASE_URL", default="").strip()
    if explicit:
        return explicit
    return "https://sandbox.safaricom.co.ke"


DARAJA_BASE = _get_daraja_base()


# ---------------------------------------------------------------------------
# Credentials — MPESA_* preferred, DARAJA_* / bare names as fallback
# ---------------------------------------------------------------------------
def _cfg(primary: str, *fallbacks: str, default: str = "") -> str:
    val = config(primary, default="").strip()
    if val:
        return val
    for fb in fallbacks:
        val = config(fb, default="").strip()
        if val:
            return val
    return default


CONSUMER_KEY = _cfg("MPESA_CONSUMER_KEY", "CONSUMER_KEY")
CONSUMER_SECRET = _cfg("MPESA_CONSUMER_SECRET", "CONSUMER_SECRET")


# ---------------------------------------------------------------------------
# OAuth access token with in-memory cache (tokens valid ~3600 s)
# ---------------------------------------------------------------------------
_token_cache: dict = {"token": "", "expires_at": 0.0}


def get_access_token() -> str:
    """
    Return a valid Daraja OAuth access token (client_credentials flow).
    Caches the token for 3500 s to avoid redundant Daraja API calls.
    Raises ValueError if credentials are missing or the request fails.
    """
    consumer_key = _cfg("MPESA_CONSUMER_KEY", "CONSUMER_KEY")
    consumer_secret = _cfg("MPESA_CONSUMER_SECRET", "CONSUMER_SECRET")
    if not consumer_key or not consumer_secret:
        raise ValueError("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set")

    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    url = f"{DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials"
    credentials = base64.b64encode(
        f"{consumer_key}:{consumer_secret}".encode()
    ).decode()
    req = Request(url, method="GET", headers={"Authorization": f"Basic {credentials}"})
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            token = data["access_token"]
            _token_cache["token"] = token
            _token_cache["expires_at"] = now + 3500  # 100 s safety buffer
            return token
    except (HTTPError, URLError, KeyError) as e:
        raise ValueError(f"Daraja OAuth failed: {e}") from e


def invalidate_token_cache() -> None:
    """Force next call to get_access_token() to fetch a fresh token."""
    _token_cache["token"] = ""
    _token_cache["expires_at"] = 0.0


# ---------------------------------------------------------------------------
# STK Push
# ---------------------------------------------------------------------------
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
    Build Daraja Lipa Na M-Pesa Online (STK Push) request body.

    TransactionType:
      - "CustomerPayBillOnline"  → Paybill number
      - "CustomerBuyGoodsOnline" → Till / Buy Goods number
    Set MPESA_TRANSACTION_TYPE in .env to switch.
    """
    # Normalize phone → 254XXXXXXXXX
    p = phone.strip().replace(" ", "").replace("+", "")
    if p.startswith("0"):
        p = "254" + p[1:]
    elif not p.startswith("254"):
        p = "254" + p
    if not _KENYA_PHONE_RE.match(p):
        raise ValueError(f"Invalid Kenyan phone number: '{phone}'. Expected format: 07XXXXXXXX or 254XXXXXXXXX")

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    passkey = passkey or _cfg("MPESA_PASSKEY", "DARAJA_PASSKEY")
    shortcode = shortcode or _cfg("MPESA_SHORTCODE", "DARAJA_SHORTCODE", default="174379")
    password_str = shortcode + passkey + timestamp
    password = base64.b64encode(password_str.encode()).decode()

    transaction_type = _cfg(
        "MPESA_TRANSACTION_TYPE", "DARAJA_TRANSACTION_TYPE",
        default="CustomerPayBillOnline",
    )

    return {
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": transaction_type,
        "Amount": round(amount, 2),
        "PartyA": p,
        "PartyB": shortcode,
        "PhoneNumber": p,
        "CallBackURL": (
            callback_url
            or _cfg("MPESA_CALLBACK_URL", "DARAJA_CALLBACK_URL", default="https://example.com/mpesa/callback")
        ),
        "AccountReference": account_reference,
        "TransactionDesc": description,
    }


def send_stk_push(phone: str, amount: float) -> dict:
    """
    Obtain a Daraja access token and send an STK Push request.
    Returns the Daraja JSON response or raises ValueError.
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


# ---------------------------------------------------------------------------
# STK Push Query (status check for lost callbacks)
# ---------------------------------------------------------------------------
def query_transaction_status(checkout_request_id: str) -> dict:
    """
    Query M-Pesa STK Push transaction status by CheckoutRequestID.

    Daraja STK Query API requires four fields:
      BusinessShortCode, Password, Timestamp, CheckoutRequestID
    (Sending only CheckoutRequestID returns an error.)

    Returns Daraja JSON (ResultCode, ResultDesc, CallbackMetadata…) or raises ValueError.
    """
    token = get_access_token()
    shortcode = _cfg("MPESA_SHORTCODE", "DARAJA_SHORTCODE", default="174379")
    passkey = _cfg("MPESA_PASSKEY", "DARAJA_PASSKEY")

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode((shortcode + passkey + timestamp).encode()).decode()

    url = f"{DARAJA_BASE}/mpesa/stkpushquery/v1/query"
    payload = json.dumps({
        "BusinessShortCode": shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": checkout_request_id,
    }).encode()
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
