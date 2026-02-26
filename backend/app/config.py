"""
Centralized config: reads from the root .env file (PROJECT_ROOT/.env).
All modules should import `config` from here instead of from decouple directly.
When running as a PyInstaller frozen exe, looks for .env next to server.exe
(i.e. $INSTDIR/resources/.env, which is what the NSIS installer writes).
"""
import sys as _sys
from pathlib import Path
from decouple import Config, RepositoryEnv

if getattr(_sys, "frozen", False):
    # PyInstaller frozen exe: sys.executable = $INSTDIR/resources/server.exe
    ENV_FILE = Path(_sys.executable).parent / ".env"
else:
    # Development: project root is three levels up from backend/app/config.py
    ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

# The directory containing the .env file (project root)
PROJECT_ROOT = ENV_FILE.parent

# If .env exists, use it; otherwise fall back to decouple's default (looks in cwd)
if ENV_FILE.is_file():
    config = Config(RepositoryEnv(str(ENV_FILE)))
else:
    from decouple import config as _default_config
    config = _default_config
