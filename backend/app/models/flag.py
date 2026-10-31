# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Support Flags, Playbooks, Remedial Queue
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import GUID, utcnow


class SupportFlag(Base):
    """Represents a raised support signal for a student in a course/topic."""
    __tablename__ = "support_flags"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)

    # ML output
    track: Mapped[str] = mapped_column(String(30), nullable=False)  # A_foundational | B_language | C_engagement | normal
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)

    # Explainability: JSON list of reason strings and contributing features
    reasons: Mapped[str] = mapped_column(Text, default="[]")
    top_features: Mapped[str] = mapped_column(Text, default="[]")  # JSON: [{feature, value, plain_language}]

    # Teacher workflow
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | acknowledged | dismissed | resolved | overridden
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    override_track: Mapped[str | None] = mapped_column(String(30), nullable=True)  # teacher's manual classification
    override_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    playbooks: Mapped[list[Playbook]] = relationship("Playbook", back_populates="flag", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_flag_student_course", "student_id", "course_id"),
        Index("ix_flag_status", "status"),
    )


class Playbook(Base):
    """Generated teacher playbook for a support flag."""
    __tablename__ = "playbooks"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    flag_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("support_flags.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # JSON per §11.1
    strategy_ids_used: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of strategy IDs
    approved_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    flag: Mapped[SupportFlag] = relationship("SupportFlag", back_populates="playbooks")


class RemedialQueueItem(Base):
    """Spaced-repetition queue entry for a student on a topic."""
    __tablename__ = "remedial_queue_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    topic_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("syllabus_topics.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    next_review_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    repetition_count: Mapped[int] = mapped_column(Integer, default=0)
    last_result: Mapped[str | None] = mapped_column(String(10), nullable=True)  # pass | miss
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "topic_id", "course_id", name="uq_remedial_item"),
        Index("ix_remedial_student_due", "student_id", "next_review_at"),
    )


class EngagementStats(Base):
    """Per-student per-course streak and retention tracking."""
    __tablename__ = "engagement_stats"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    streak_freeze_used: Mapped[bool] = mapped_column(default=False)
    retention_points: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_engagement_student_course"),
    )
