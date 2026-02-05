"""
Pytest fixtures for DukaPOS backend tests.
Uses a file-based test SQLite DB so all connections see the same schema (avoids
:memory: per-connection isolation). Test DB path: ./test_dukapos.db (gitignored).
"""
import os

import pytest

# Use file-based test DB before any app/database import so all threads share it.
# Use ABSOLUTE path to avoid CWD issues
_backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_test_db_path = os.path.join(_backend_dir, "test_dukapos.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient; DB is test_dukapos.db and seeded by app lifespan."""
    # Ensure tables exist with same engine the app uses (lifespan may run in another context)
    from app.database import create_db_and_tables
    create_db_and_tables()
    c = TestClient(app)
    c.get("/health")  # trigger lifespan
    return c
