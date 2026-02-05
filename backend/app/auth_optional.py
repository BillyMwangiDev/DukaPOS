"""
Optional API key authentication. When API_KEY is set in env, requests must include
X-API-Key or Authorization: Bearer <API_KEY>. When not set, no auth (app works as before).
"""
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import config


def get_optional_api_key() -> str | None:
    """Return API_KEY from env if set, else None (auth disabled)."""
    key = config("API_KEY", default="").strip()
    return key if key else None


# Paths that skip API key check when API_KEY is set
PUBLIC_PATHS = {"/health", "/users/login", "/docs", "/openapi.json", "/redoc", "/redoc/static/redoc.standalone.js"}


def _path_is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    if path.startswith("/docs") or path.startswith("/openapi") or path.startswith("/redoc"):
        return True
    return False


class OptionalAPIKeyMiddleware(BaseHTTPMiddleware):
    """When API_KEY is set, require X-API-Key or Authorization: Bearer for non-public paths."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        api_key = get_optional_api_key()
        if not api_key:
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if _path_is_public(path):
            return await call_next(request)

        provided = request.headers.get("X-API-Key") or request.headers.get("Authorization")
        if provided and provided.startswith("Bearer "):
            provided = provided[7:].strip()
        elif provided:
            provided = provided.strip()
        else:
            provided = None

        if provided != api_key:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid API key. Set X-API-Key header or Authorization: Bearer <key>."},
            )
        return await call_next(request)
