"""Password and PIN hashing for DukaPOS users (bcrypt)."""
import bcrypt

# Bcrypt limit; longer inputs are truncated before hashing.
_BCRYPT_MAX_PASSWORD_BYTES = 72


def _to_bytes(s: str) -> bytes:
    """Encode string to bytes, truncate to bcrypt limit."""
    b = s.encode("utf-8")
    if len(b) > _BCRYPT_MAX_PASSWORD_BYTES:
        return b[:_BCRYPT_MAX_PASSWORD_BYTES]
    return b


def hash_password(plain: str) -> str:
    """Hash a plain password for storage."""
    return bcrypt.hashpw(_to_bytes(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against its hash."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def hash_pin(pin: str) -> str:
    """Hash a 4-6 digit PIN for storage."""
    return bcrypt.hashpw(_to_bytes(pin), bcrypt.gensalt()).decode("utf-8")


def verify_pin(plain_pin: str, pin_hash: str) -> bool:
    """Verify a plain PIN against its hash."""
    if not pin_hash:
        return False
    try:
        return bcrypt.checkpw(_to_bytes(plain_pin), pin_hash.encode("utf-8"))
    except Exception:
        return False
