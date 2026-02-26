"""
Pytest fixtures for DukaPOS backend tests.
Uses a file-based test SQLite DB so all connections see the same schema.
"""
import os
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

# We must set this before importing app.database
# Use a distinct name for testing to avoid conflicting with dev DB
TEST_DB_NAME = "test_dukapos.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_NAME}"

from main import app
from app.database import engine, create_db_and_tables

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create test DB tables once per session and seed default data."""
    # Remove existing test DB if it exists to start fresh
    if os.path.exists(TEST_DB_NAME):
        try:
            os.remove(TEST_DB_NAME)
        except PermissionError:
            pass  # Might be in use, but we'll try to overwrite/use it

    create_db_and_tables()
    yield
    # Optional: cleanup after session
    # if os.path.exists(TEST_DB_NAME):
    #     os.remove(TEST_DB_NAME)

@pytest.fixture
def session():
    """Provide a transactional session for each test."""
    with Session(engine) as session:
        yield session

@pytest.fixture
def client(session) -> TestClient:
    """FastAPI TestClient using the test database."""
    # We can override the dependency if the app uses get_session
    # app.dependency_overrides[get_session] = lambda: session
    return TestClient(app)
