"""System backup: copy DB (SQLite) or pg_dump (PostgreSQL) to timestamped zip in /backups."""
import os
import subprocess
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.config import config
from sqlmodel import Session

from app.database import engine
from app.models import StoreSettings

router = APIRouter(prefix="/system", tags=["system"])

DATABASE_URL = config("DATABASE_URL", default="sqlite:///./dukapos.db")
AUTO_BACKUP_MAX_AGE_HOURS = 24


class BackupResponse(BaseModel):
    ok: bool
    path: str | None = None
    error: str | None = None


class BackupItem(BaseModel):
    filename: str
    size_bytes: int
    created_at: str


class BackupListResponse(BaseModel):
    backups: list[BackupItem]


def _get_backend_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _get_db_path() -> Path | None:
    if DATABASE_URL.startswith("sqlite:///"):
        path = DATABASE_URL.replace("sqlite:///", "").strip()
        p = Path(path)
        if not p.is_absolute():
            p = _get_backend_root() / path
        return p
    return None


def _do_backup_postgres() -> BackupResponse:
    """PostgreSQL backup via pg_dump; output zipped in backups dir."""
    try:
        parsed = urlparse(DATABASE_URL)
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        user = parsed.username or "postgres"
        password = parsed.password
        dbname = (parsed.path or "/postgres").lstrip("/") or "postgres"
    except Exception as e:
        return BackupResponse(ok=False, error=f"Invalid DATABASE_URL: {e}")
    backend_root = _get_backend_root()
    backups_dir = backend_root / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dump_name = f"dukapos_pg_{ts}.sql"
    zip_name = f"dukapos_backup_{ts}.zip"
    dump_path = backups_dir / dump_name
    zip_path = backups_dir / zip_name
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password
    try:
        subprocess.run(
            ["pg_dump", "-h", host, "-p", str(port), "-U", user, "-d", dbname, "-f", str(dump_path), "--no-owner", "--no-acl"],
            env=env,
            check=True,
            capture_output=True,
            timeout=300,
        )
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(dump_path, dump_name)
        dump_path.unlink(missing_ok=True)
        return BackupResponse(ok=True, path=str(zip_path))
    except subprocess.CalledProcessError as e:
        dump_path.unlink(missing_ok=True)
        err = (e.stderr or b"").decode("utf-8", errors="replace").strip() or str(e)
        return BackupResponse(ok=False, error=f"pg_dump failed: {err}")
    except FileNotFoundError:
        return BackupResponse(ok=False, error="pg_dump not found. Install PostgreSQL client tools.")
    except Exception as e:
        dump_path.unlink(missing_ok=True)
        return BackupResponse(ok=False, error=str(e))


def _do_backup() -> BackupResponse:
    """Core backup logic: SQLite file copy or PostgreSQL pg_dump, then zip."""
    if DATABASE_URL.startswith("postgres"):
        return _do_backup_postgres()
    db_path = _get_db_path()
    if not db_path or not db_path.exists():
        return BackupResponse(ok=False, error="Database file not found.")
    backend_root = _get_backend_root()
    backups_dir = backend_root / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    zip_name = f"dukapos_backup_{ts}.zip"
    zip_path = backups_dir / zip_name
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_path, db_path.name)
        return BackupResponse(ok=True, path=str(zip_path))
    except Exception as e:
        return BackupResponse(ok=False, error=str(e))


def run_backup_if_needed() -> None:
    """
    If auto_backup_enabled and newest backup is older than 24h (or none), create one.
    Call from startup in a background thread.
    """
    try:
        with Session(engine) as session:
            row = session.get(StoreSettings, 1)
            if row and not getattr(row, "auto_backup_enabled", True):
                return
        backups_dir = _get_backups_dir()
        backups_dir.mkdir(parents=True, exist_ok=True)
        zips = list(backups_dir.glob("*.zip"))
        if zips:
            newest = max(zips, key=lambda p: p.stat().st_mtime)
            age = datetime.now(timezone.utc) - datetime.fromtimestamp(newest.stat().st_mtime, tz=timezone.utc)
            if age < timedelta(hours=AUTO_BACKUP_MAX_AGE_HOURS):
                return
        _do_backup()
    except Exception:
        pass


@router.post("/backup", response_model=BackupResponse)
def create_backup():
    """Create a manual backup (timestamped .zip in backups folder)."""
    return _do_backup()


def _get_backups_dir() -> Path:
    """Backups directory (same for SQLite and PostgreSQL)."""
    return _get_backend_root() / "backups"


@router.get("/backups", response_model=BackupListResponse)
def list_backups():
    """List backup files (newest first) with filename, size, created_at."""
    backups_dir = _get_backups_dir()
    if not backups_dir or not backups_dir.exists():
        return BackupListResponse(backups=[])
    items = []
    for p in backups_dir.glob("*.zip"):
        try:
            stat = p.stat()
            items.append(BackupItem(
                filename=p.name,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            ))
        except Exception:
            continue
    items.sort(key=lambda x: x.created_at, reverse=True)
    return BackupListResponse(backups=items)


@router.get("/backups/download/{filename:path}")
def download_backup(filename: str):
    """Download a backup file by filename (must be under backups dir)."""
    backups_dir = _get_backups_dir()
    if not backups_dir.exists():
        raise HTTPException(status_code=404, detail="Backups not available")
    path = (backups_dir / filename).resolve()
    if not path.is_file() or not str(path).startswith(str(backups_dir.resolve())):
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path, filename=path.name)
