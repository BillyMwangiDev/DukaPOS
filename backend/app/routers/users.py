"""Users & Staff: CRUD and login (Phase 1)."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel, Field

from app.database import get_session
from app.models import User
from app.auth_utils import hash_password, verify_password, hash_pin, verify_pin

router = APIRouter(prefix="/users", tags=["users"])


# --- Schemas ---
class UserCreate(BaseModel):
    """role and pin optional with defaults (API/test compatibility). full_name accepted but not stored."""
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    role: str = Field("cashier", pattern="^(admin|cashier)$")
    pin: str = Field("0000", min_length=4, max_length=6, pattern="^[0-9]+$")
    full_name: Optional[str] = None  # accepted, not stored


class UserUpdate(BaseModel):
    role: Optional[str] = Field(None, pattern="^(admin|cashier)$")
    pin: Optional[str] = Field(None, min_length=4, max_length=6, pattern="^[0-9]+$")
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool


class VerifyAdminPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6, pattern="^[0-9]+$")


class VerifyAdminPinResponse(BaseModel):
    ok: bool = True


def _to_response(u: User) -> UserResponse:
    return UserResponse(id=u.id or 0, username=u.username, role=u.role, is_active=u.is_active)


@router.get("", response_model=list[UserResponse])
def list_users(session: Session = Depends(get_session)):
    """List all users (for admin UI)."""
    users = session.exec(select(User)).all()
    return [_to_response(u) for u in users]


@router.post("", response_model=UserResponse)
def create_user(body: UserCreate, session: Session = Depends(get_session)):
    """Create a new user."""
    existing = session.exec(select(User).where(User.username == body.username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        pin_hash=hash_pin(body.pin),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _to_response(user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, session: Session = Depends(get_session)):
    """Update role, pin, or is_active."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        user.role = body.role
    if body.pin is not None:
        user.pin_hash = hash_pin(body.pin)
    if body.is_active is not None:
        user.is_active = body.is_active
    session.add(user)
    session.commit()
    session.refresh(user)
    return _to_response(user)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    """Login with username and password. Returns user object (no JWT for now)."""
    user = session.exec(select(User).where(User.username == body.username)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User is disabled")
    if not verify_password(body.password, user.password_hash or ""):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(id=user.id or 0, username=user.username, role=user.role, is_active=user.is_active)


@router.post("/verify-admin-pin", response_model=VerifyAdminPinResponse)
def verify_admin_pin(body: VerifyAdminPinRequest, session: Session = Depends(get_session)):
    """Verify that the given PIN belongs to an active admin. Used for Close Shift / Z-Report."""
    admins = session.exec(select(User).where(User.role == "admin", User.is_active)).all()
    for admin in admins:
        if verify_pin(body.pin, admin.pin_hash or ""):
            return VerifyAdminPinResponse(ok=True)
    raise HTTPException(status_code=401, detail="Invalid admin PIN")


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, session: Session = Depends(get_session)):
    """Delete a user (API/test compatibility)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    session.delete(user)
    session.commit()
    return None
