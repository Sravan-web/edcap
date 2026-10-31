# ==============================================================================
# PIPELINE / MODEL COMPONENT: ASGI Middleware Stack
# TECH STACK: Python / FastAPI / Starlette
# ==============================================================================
from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Shared limiter instance (imported by route modules for per-endpoint limits)
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.GLOBAL_RATE_LIMIT])


def apply_security_headers(response: Response, is_admin: bool = False) -> Response:
    """Apply security headers to a response."""
    csp = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    same_site = "Strict" if is_admin else "Lax"

    response.headers["Content-Security-Policy"] = csp
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    if settings.is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )

    return response


def register_middleware(app: FastAPI) -> None:
    """Attach all middleware to the FastAPI application."""

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    # ── Request ID + Logging + Security Headers ───────────────────────────────
    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start = time.perf_counter()

        # Check request size
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.REQUEST_MAX_SIZE_BYTES:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large."},
            )

        # Anti-CSRF Origin validation on cookie-authenticated state-changing requests
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.cookies.get("access_token"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.ALLOWED_ORIGINS:
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed: untrusted Origin header."},
                )

        import structlog
        with structlog.contextvars.bound_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        ):
            response: Response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            response.headers["X-Request-ID"] = request_id

            is_admin_path = request.url.path.startswith("/api/v1/admin")
            apply_security_headers(response, is_admin=is_admin_path)

            logger.info(
                "http_request",
                status=response.status_code,
                duration_ms=duration_ms,
                ip_prefix=_mask_ip(request.client.host if request.client else ""),
            )
            return response


def _mask_ip(ip: str) -> str:
    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.x.x"
    return ip[:8] + "..."
