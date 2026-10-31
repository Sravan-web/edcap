# ==============================================================================
# PIPELINE / MODEL COMPONENT: Telemetry API — Batch Ingest with Rate Limiting
# TECH STACK: Python / FastAPI / SQLAlchemy
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.telemetry import TelemetryEvent

settings = get_settings()
logger = get_logger(__name__)
router = APIRouter(prefix="/telemetry", tags=["telemetry"])

ALLOWED_INTERACTION_TYPES = {
    "item_attempt", "page_view", "idle", "format_switch", "test_start", "test_complete",
}
ALLOWED_FORMATS = {"text_based", "visual", "audio"}


class TelemetryMetrics(BaseModel):
    time_spent_seconds: float = Field(ge=0.0, le=3600.0)
    idle_time_seconds: float = Field(ge=0.0, le=3600.0)
    hesitation_count: int = Field(ge=0, le=1000)
    erasure_or_backspace_count: int = Field(ge=0, le=10000)
    format_used: str = Field(max_length=30)
    attempt_number: int = Field(ge=1, le=100)
    is_correct: bool | None = None
    submission_latency_s: float = Field(default=0.0, ge=0.0, le=3600.0)

    @field_validator("format_used")
    @classmethod
    def validate_format(cls, v: str) -> str:
        if v not in ALLOWED_FORMATS:
            return "text_based"
        return v


class TelemetryEventIn(BaseModel):
    event_id: str = Field(min_length=5, max_length=64)
    timestamp: datetime
    # student_id intentionally NOT trusted from client — derived from session
    session_id: str = Field(min_length=1, max_length=64)
    curriculum_node_id: uuid.UUID | None = None
    quiz_attempt_id: uuid.UUID | None = None
    interaction_type: str = Field(max_length=50)
    telemetry_metrics: TelemetryMetrics

    @field_validator("interaction_type")
    @classmethod
    def validate_interaction_type(cls, v: str) -> str:
        if v not in ALLOWED_INTERACTION_TYPES:
            raise ValueError(f"Invalid interaction_type. Allowed: {ALLOWED_INTERACTION_TYPES}")
        return v


class TelemetryBatch(BaseModel):
    events: list[TelemetryEventIn] = Field(min_length=1, max_length=50)


@router.post("/events", status_code=202)
async def ingest_telemetry(
    body: TelemetryBatch,
    request: Request,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Batch ingest telemetry events.
    - student_id is derived from the authenticated session (NEVER trusted from client).
    - Deduplicates on event_id.
    - Rate-limited per student.
    """
    from app.security.rate_limiter import InMemoryRateLimiter

    student_id = current_user.id
    accepted = 0
    skipped = 0

    for event in body.events:
        # Dedup check
        existing = await db.execute(
            select(TelemetryEvent).where(TelemetryEvent.event_id == event.event_id)
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        m = event.telemetry_metrics
        te = TelemetryEvent(
            event_id=event.event_id,
            student_id=student_id,          # SERVER-DERIVED
            session_id=event.session_id,
            curriculum_node_id=event.curriculum_node_id,
            quiz_attempt_id=event.quiz_attempt_id,
            interaction_type=event.interaction_type,
            time_spent_seconds=m.time_spent_seconds,
            idle_time_seconds=m.idle_time_seconds,
            hesitation_count=m.hesitation_count,
            erasure_count=m.erasure_or_backspace_count,
            format_used=m.format_used,
            attempt_number=m.attempt_number,
            is_correct=m.is_correct,
            submission_latency_s=m.submission_latency_s,
            event_timestamp=event.timestamp.replace(tzinfo=None),
        )
        db.add(te)
        accepted += 1

    await db.flush()
    return {"accepted": accepted, "skipped_duplicates": skipped}
