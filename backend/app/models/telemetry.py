# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Telemetry Events & Student Features
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import GUID, utcnow


class TelemetryEvent(Base):
    """Stores raw behavioural telemetry events per §11.4.
    Note: student_id is derived server-side from the authenticated session;
    it is NEVER trusted from the client payload.
    """
    __tablename__ = "telemetry_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)  # dedup key
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    curriculum_node_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    quiz_attempt_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("quiz_attempts.id"), nullable=True)
    interaction_type: Mapped[str] = mapped_column(String(50), nullable=False)  # item_attempt | page_view | idle | format_switch

    # Metrics from §11.4
    time_spent_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    idle_time_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    hesitation_count: Mapped[int] = mapped_column(Integer, default=0)
    erasure_count: Mapped[int] = mapped_column(Integer, default=0)  # backspace count only, never content
    format_used: Mapped[str] = mapped_column(String(30), default="text_based")  # text_based | visual | audio
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    submission_latency_s: Mapped[float] = mapped_column(Float, default=0.0)

    event_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        Index("ix_telemetry_student_time", "student_id", "event_timestamp"),
        Index("ix_telemetry_node", "curriculum_node_id"),
    )


class StudentFeatures(Base):
    """Computed ML features per student per course, recomputed periodically."""
    __tablename__ = "student_features"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)

    # Core features per §6.1
    velocity_decay_score: Mapped[float] = mapped_column(Float, default=1.0)
    format_preference_delta: Mapped[float] = mapped_column(Float, default=0.0)
    hesitation_index: Mapped[float] = mapped_column(Float, default=0.0)
    persistence_decay_rate: Mapped[float] = mapped_column(Float, default=0.0)
    topic_accuracy: Mapped[float] = mapped_column(Float, default=1.0)
    trend_slope: Mapped[float] = mapped_column(Float, default=0.0)
    streak_consistency: Mapped[float] = mapped_column(Float, default=1.0)
    prereq_accuracy: Mapped[float] = mapped_column(Float, default=1.0)
    reading_speed: Mapped[float] = mapped_column(Float, default=1.0)

    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_features_student_course"),
        Index("ix_features_student", "student_id"),
    )
