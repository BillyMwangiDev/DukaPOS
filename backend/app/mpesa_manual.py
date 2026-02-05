"""M-Pesa Buy Goods manual code verification. Optional external API or built-in placeholder."""
from app.config import config
import json
import urllib.request
import urllib.error


def verify_manual_code(code: str) -> bool:
    """
    Verify M-Pesa transaction code (e.g. SAB123XYZ).
    - When M_PESA_VERIFY_API_URL is set: POST {"code": "<code>"} to that URL; 200 = valid.
    - When not set: returns True for any non-empty code (placeholder; app works as before).
    """
    if not code or not (code := code.strip()):
        return False

    verify_url = config("M_PESA_VERIFY_API_URL", default="").strip()
    if not verify_url:
        return True  # no API configured: accept non-empty (original behavior)

    try:
        body = json.dumps({"code": code}).encode("utf-8")
        req = urllib.request.Request(
            verify_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=10)
        return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        return 200 <= e.code < 300
    except Exception:
        return False
