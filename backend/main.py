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
        try:
            from sqlalchemy import select
            from app.core.database import AsyncSessionLocal
            from app.models.course import Course
            from app.models.user import User
            from app.services.diagnostic_service import get_course_diagnostic_summary

            async with AsyncSessionLocal() as db:
                fac = (await db.execute(select(User).where(User.email == "prof.sharma@edcap.demo").limit(1))).scalar_one_or_none()
                courses = (await db.execute(select(Course).where(Course.is_active == True))).scalars().all()
                if fac and courses:
                    for c in courses:
                        summary = await get_course_diagnostic_summary(db, course_id=c.id, faculty_id=fac.id)
                        logger.info(
                            "diagnostic_ecosystem_ready",
                            course_code=c.code,
                            total_evaluated=summary["total_evaluated"],
                            developing=summary["tier_distribution"]["developing"]["count"],
                            proficient=summary["tier_distribution"]["proficient"]["count"],
                            advanced=summary["tier_distribution"]["advanced"]["count"],
                        )
                    await db.commit()
        except Exception as exc:
            logger.error("startup_diagnostic_sync_error", error=str(exc))
    yield
    logger.info("shutdown", app_name=settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="EdCap — Role-Based Student Performance Analytics & Remedial Testing Platform",
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

# ── Direct /api/* Role-Separated Alias Routes ─────────────────────────────────
app.include_router(auth.router, prefix="/api")
app.include_router(students.router, prefix="/api")

from fastapi import Depends  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402
from app.api.deps import CurrentUser, RequireFaculty, RequireStudent  # noqa: E402
from app.core.database import get_db  # noqa: E402


@app.post("/api/faculty/student-metrics", dependencies=[RequireFaculty], tags=["faculty"])
async def api_faculty_student_metrics(
    payload: assessments.DiagnosticEvaluatePayload,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    return await assessments.evaluate_diagnostic_parameters(payload=payload, current_user=current_user, db=db)


@app.get("/api/faculty/analytics", dependencies=[RequireFaculty], tags=["faculty"])
async def api_faculty_analytics(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    return await assessments.get_diagnostic_summary(course_id=course_id, current_user=current_user, db=db)


@app.post("/api/faculty/generate-quiz", dependencies=[RequireFaculty], tags=["faculty"])
async def api_faculty_generate_quiz(
    payload: assessments.GenerateTopicQuizPayload,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    return await assessments.generate_targeted_remedial_quiz(payload=payload, current_user=current_user, db=db)


@app.get("/api/student/assigned-quizzes", dependencies=[RequireStudent], tags=["student"])
async def api_student_assigned_quizzes(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    return await quizzes.get_assigned_remedial_quiz(current_user=current_user, db=db)


class DirectStudentQuizSubmit(assessments.BaseModel):
    quiz_set_id: uuid.UUID
    answers: list[attempts.SubmitAnswerRequest] = []


@app.post("/api/student/submit-quiz", dependencies=[RequireStudent], tags=["student"])
async def api_student_submit_quiz(
    body: DirectStudentQuizSubmit,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    started = await attempts.start_attempt(
        body=attempts.StartAttemptRequest(quiz_set_id=body.quiz_set_id),
        current_user=current_user,
        db=db,
    )
    attempt_id = uuid.UUID(started["id"])
    return await attempts.finish_attempt(
        attempt_id=attempt_id,
        current_user=current_user,
        body=attempts.FinishAttemptRequest(answers=body.answers, action="complete"),
        db=db,
    )
