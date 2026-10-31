# ==============================================================================
# PIPELINE / MODEL COMPONENT: Pydantic v2 Schemas — Common, User, Course, Quiz
# TECH STACK: Python / Pydantic v2
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ── Common ────────────────────────────────────────────────────────────────────

class PaginationMeta(BaseModel):
    total: int
    limit: int
    offset: int


class MessageResponse(BaseModel):
    message: str


# ── User ──────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    status: str
    theme: str
    font_preference: str
    mfa_enabled: bool
    created_at: str

    model_config = {"from_attributes": True}


# ── Course ────────────────────────────────────────────────────────────────────

class CourseOut(BaseModel):
    id: str
    code: str
    name: str
    description: str
    is_active: bool
    created_at: str


class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)


# ── Assessment ────────────────────────────────────────────────────────────────

class AssessmentOut(BaseModel):
    id: str
    course_id: str
    title: str
    assessment_date: str
    topic_tag: str
    source: str


class ScoreOut(BaseModel):
    student_id: str
    assessment_id: str
    topic_id: str | None
    score: float
    max_score: float
    percentage: float


# ── Quiz ──────────────────────────────────────────────────────────────────────

class QuestionOut(BaseModel):
    id: str
    stem: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    difficulty: str
    question_type: str
    sort_order: int
    # Correct option NOT included for student-facing responses


class QuizSetOut(BaseModel):
    id: str
    course_id: str
    module_id: str | None
    topic_id: str | None
    scheduled_date: str
    status: str
    question_count: int


# ── Support Flags ─────────────────────────────────────────────────────────────

class FlagOut(BaseModel):
    id: str
    student_id: str
    course_id: str
    topic_id: str | None
    track: str
    risk_score: float
    reasons: Any
    status: str
    created_at: str


# ── Playbook ──────────────────────────────────────────────────────────────────

class PlaybookOut(BaseModel):
    id: str
    flag_id: str
    course_id: str
    content: Any
    strategy_ids_used: list[str]
    approved_by: str | None
    created_at: str


# ── Remedial ──────────────────────────────────────────────────────────────────

class RemedialItemOut(BaseModel):
    id: str
    topic_id: str
    course_id: str
    next_review_at: str
    interval_days: int
    repetition_count: int
    last_result: str | None


# ── Telemetry ─────────────────────────────────────────────────────────────────

class TelemetryEventIn(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    curriculum_node_id: str | None = None
    metrics: dict[str, Any] = {}
    client_ts: datetime | None = None
