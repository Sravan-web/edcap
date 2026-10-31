# ==============================================================================
# PIPELINE / MODEL COMPONENT: FastAPI Application Entry Point
# TECH STACK: Python / FastAPI / Uvicorn
# ==============================================================================
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.database import create_tables
from app.core.logging import configure_logging, get_logger
from app.core.middleware import register_middleware

settings = get_settings()
configure_logging(log_level="DEBUG" if settings.DEBUG else "INFO")
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", app_name=settings.APP_NAME, env=settings.ENVIRONMENT)
    if settings.ENVIRONMENT in ("development", "testing"):
        await create_tables()
    yield
    logger.info("shutdown", app_name=settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="EdCap AI — Early-Support & Teacher Capacity Platform (SIH1432)",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
register_middleware(app)


# ── Global Exception Handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    logger.error(
        "unhandled_exception",
        request_id=request_id,
        path=request.url.path,
        exc_type=type(exc).__name__,
        exc_message=str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected error occurred. Please try again or contact support.",
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/healthz", tags=["system"])
async def healthz():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.ENVIRONMENT}


# ── API Routers ───────────────────────────────────────────────────────────────
from app.api.v1 import (  # noqa: E402
    admin,
    analytics,
    assessments,
    attempts,
    auth,
    courses,
    flags,
    modules,
    playbooks,
    quizzes,
    remedial,
    students,
    telemetry,
    users,
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(courses.router, prefix=API_PREFIX)
app.include_router(assessments.router, prefix=API_PREFIX)
app.include_router(modules.router, prefix=API_PREFIX)
app.include_router(quizzes.router, prefix=API_PREFIX)
app.include_router(attempts.router, prefix=API_PREFIX)
app.include_router(telemetry.router, prefix=API_PREFIX)
app.include_router(students.router, prefix=API_PREFIX)
app.include_router(flags.router, prefix=API_PREFIX)
app.include_router(playbooks.router, prefix=API_PREFIX)
app.include_router(remedial.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
