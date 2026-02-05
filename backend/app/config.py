"""
Centralized config: reads from the root .env file (PROJECT_ROOT/.env).
All modules should import `config` from here instead of from decouple directly.
"""
from pathlib import Path
from decouple import Config, RepositoryEnv

# Project root is two levels up from this file (backend/app/config.py -> PROJECT_ROOT)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

# If root .env exists, use it; otherwise fall back to backend/.env for backwards compat
if ENV_FILE.is_file():
    config = Config(RepositoryEnv(str(ENV_FILE)))
else:
    # Fallback to default decouple behavior (looks in cwd)
    from decouple import config as _default_config
    config = _default_config
