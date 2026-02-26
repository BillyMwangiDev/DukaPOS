"""API Keys management router for configuring M-Pesa and other API credentials."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Optional

from app.config import ENV_FILE

router = APIRouter(prefix="/settings", tags=["settings"])


class ApiKeysResponse(BaseModel):
    """Response model with masked sensitive values."""
    daraja_base_url: str
    consumer_key_masked: str
    consumer_secret_masked: str
    daraja_passkey_masked: str
    daraja_shortcode: str
    has_consumer_key: bool
    has_consumer_secret: bool
    has_passkey: bool


class ApiKeysUpdate(BaseModel):
    """Update model for API keys. Only non-None fields will be updated."""
    daraja_base_url: Optional[str] = None
    consumer_key: Optional[str] = None
    consumer_secret: Optional[str] = None
    daraja_passkey: Optional[str] = None
    daraja_shortcode: Optional[str] = None


def _mask_value(value: str) -> str:
    """Mask sensitive value, showing only first 4 and last 4 characters."""
    if not value or len(value) <= 8:
        return "****" if value else ""
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


def _read_env_file() -> dict[str, str]:
    """Read .env file and return key-value pairs."""
    env_vars = {}
    if ENV_FILE.is_file():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")
    return env_vars


def _write_env_file(env_vars: dict[str, str]) -> None:
    """Write key-value pairs to .env file."""
    # Ensure parent directory exists
    ENV_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        for key, value in sorted(env_vars.items()):
            # Strip control characters to prevent log injection or .env file corruption
            safe_value = value.replace("\n", "").replace("\r", "").replace("\x00", "")
            # Quote values that contain spaces
            if " " in safe_value:
                f.write(f'{key}="{safe_value}"\n')
            else:
                f.write(f"{key}={safe_value}\n")


@router.get("/api-keys", response_model=ApiKeysResponse)
def get_api_keys():
    """Get current API key configuration with masked sensitive values."""
    env_vars = _read_env_file()

    consumer_key = env_vars.get("MPESA_CONSUMER_KEY", "")
    consumer_secret = env_vars.get("MPESA_CONSUMER_SECRET", "")
    passkey = env_vars.get("MPESA_PASSKEY", "")
    
    return ApiKeysResponse(
        daraja_base_url=env_vars.get("DARAJA_BASE_URL", "https://sandbox.safaricom.co.ke"),
        consumer_key_masked=_mask_value(consumer_key),
        consumer_secret_masked=_mask_value(consumer_secret),
        daraja_passkey_masked=_mask_value(passkey),
        daraja_shortcode=env_vars.get("DARAJA_SHORTCODE", "174379"),
        has_consumer_key=bool(consumer_key),
        has_consumer_secret=bool(consumer_secret),
        has_passkey=bool(passkey),
    )


@router.put("/api-keys")
def update_api_keys(keys: ApiKeysUpdate):
    """Update API key configuration in .env file."""
    try:
        # Read current .env file
        env_vars = _read_env_file()
        
        # Update only non-None fields
        if keys.daraja_base_url is not None:
            env_vars["DARAJA_BASE_URL"] = keys.daraja_base_url
        if keys.consumer_key is not None:
            env_vars["MPESA_CONSUMER_KEY"] = keys.consumer_key
        if keys.consumer_secret is not None:
            env_vars["MPESA_CONSUMER_SECRET"] = keys.consumer_secret
        if keys.daraja_passkey is not None:
            env_vars["MPESA_PASSKEY"] = keys.daraja_passkey
        if keys.daraja_shortcode is not None:
            env_vars["DARAJA_SHORTCODE"] = keys.daraja_shortcode
        
        # Write updated .env file
        _write_env_file(env_vars)
        
        return {"ok": True, "message": "API keys updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update API keys: {str(e)}")


@router.post("/api-keys/test")
def test_api_connection():
    """Test M-Pesa API connection by attempting to get an access token."""
    try:
        from app.mpesa_utils import get_access_token

        token = get_access_token()

        if token:
            return {
                "ok": True,
                "message": "Successfully connected to M-Pesa API",
                "token_preview": f"{token[:10]}..." if len(token) > 10 else "***"
            }
        else:
            return {"ok": False, "message": "Failed to get access token"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection test failed: {str(e)}")
