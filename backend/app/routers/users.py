"""Users & Staff: CRUD and login (Phase 1)."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel, Field

from app.database import get_session
from app.models import Staff, StoreSettings
from app.auth_utils import hash_password, verify_password, hash_pin, verify_pin

router = APIRouter(prefix="/staff", tags=["staff"])


# --- Schemas ---
class StaffCreate(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    role: str = Field("cashier", pattern="^(admin|cashier|developer)$")
    pin: str = Field("0000", min_length=4, max_length=6, pattern="^[0-9]+$")


class StaffUpdate(BaseModel):
    role: Optional[str] = Field(None, pattern="^(admin|cashier|developer)$")
    pin: Optional[str] = Field(None, min_length=4, max_length=6, pattern="^[0-9]+$")
    is_active: Optional[bool] = None


class StaffResponse(BaseModel):
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


def _to_response(u: Staff) -> StaffResponse:
    return StaffResponse(id=u.id or 0, username=u.username, role=u.role, is_active=u.is_active)


@router.get("", response_model=list[StaffResponse])
def list_staff(session: Session = Depends(get_session)):
    """List all staff (for admin UI)."""
    staff_list = session.exec(select(Staff)).all()
    return [_to_response(u) for u in staff_list]


@router.post("", response_model=StaffResponse) # Assuming StaffRead is StaffResponse for now, as StaffRead is not defined.
def create_staff(body: StaffCreate, session: Session = Depends(get_session)):
    """Create a new staff member with limit check."""
    # Enforce Staff Limit
    settings = session.get(StoreSettings, 1)
    limit = getattr(settings, "staff_limit", 5) if settings else 5
    
    current_count = session.exec(select(Staff).where(Staff.is_active)).all()
    if len(current_count) >= limit:
        raise HTTPException(
            status_code=403, 
            detail=f"Staff limit reached ({limit}). Disable inactive users or upgrade license."
        )

    existing = session.exec(select(Staff).where(Staff.username == body.username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    staff = Staff(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        pin_hash=hash_pin(body.pin) if body.pin else "",
        is_active=True,
    )
    session.add(staff)
    session.commit()
    session.refresh(staff)
    return _to_response(staff)


@router.put("/{staff_id}", response_model=StaffResponse)
def update_staff(staff_id: int, body: StaffUpdate, session: Session = Depends(get_session)):
    """Update role, pin, or is_active."""
    staff = session.get(Staff, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    if body.role is not None:
        staff.role = body.role
    if body.pin is not None:
        staff.pin_hash = hash_pin(body.pin)
    if body.is_active is not None:
        staff.is_active = body.is_active
    session.add(staff)
    session.commit()
    session.refresh(staff)
    return _to_response(staff)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    """Login with username and password."""
    staff = session.exec(select(Staff).where(Staff.username == body.username)).first()
    if not staff:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not staff.is_active:
        raise HTTPException(status_code=401, detail="Staff is disabled")
    if not verify_password(body.password, staff.password_hash or ""):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(id=staff.id or 0, username=staff.username, role=staff.role, is_active=staff.is_active)


class VerifyStaffPinRequest(BaseModel):
    staff_id: int
    pin: str = Field(..., min_length=4, max_length=6, pattern="^[0-9]+$")


@router.post("/verify-staff-pin", response_model=VerifyAdminPinResponse)
def verify_staff_pin(body: VerifyStaffPinRequest, session: Session = Depends(get_session)):
    """Verify PIN for a specific staff member or any admin/developer."""
    # 1. Check if the specific staff member's PIN matches
    staff = session.get(Staff, body.staff_id)
    if staff and staff.is_active and verify_pin(body.pin, staff.pin_hash or ""):
        return VerifyAdminPinResponse(ok=True)
    
    # 2. Bypass: Check if it's an admin or developer PIN
    admins = session.exec(select(Staff).where(Staff.role.in_(["admin", "developer"]), Staff.is_active)).all()
    for admin in admins:
        if verify_pin(body.pin, admin.pin_hash or ""):
            return VerifyAdminPinResponse(ok=True)
            
    raise HTTPException(status_code=401, detail="Invalid PIN")


@router.post("/verify-admin-pin", response_model=VerifyAdminPinResponse)
def verify_admin_pin(body: VerifyAdminPinRequest, session: Session = Depends(get_session)):
    """Verify admin or developer PIN."""
    admins = session.exec(select(Staff).where(Staff.role.in_(["admin", "developer"]), Staff.is_active)).all()
    for admin in admins:
        if verify_pin(body.pin, admin.pin_hash or ""):
            return VerifyAdminPinResponse(ok=True)
    raise HTTPException(status_code=401, detail="Invalid admin PIN")


@router.delete("/{staff_id}", status_code=204)
def delete_staff(staff_id: int, session: Session = Depends(get_session)):
    """Delete a staff member."""
    staff = session.get(Staff, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    session.delete(staff)
    session.commit()
    return None

