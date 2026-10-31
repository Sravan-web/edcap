# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Assessments & Scores
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import GUID, utcnow


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    assessment_date: Mapped[date] = mapped_column(Date, nullable=False)
    topic_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | csv_import
    created_by: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    scores: Mapped[list[AssessmentScore]] = relationship("AssessmentScore", back_populates="assessment", cascade="all, delete-orphan")


class AssessmentScore(Base):
    __tablename__ = "assessment_scores"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assessment_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    topic_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False)  # computed on insert
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    assessment: Mapped[Assessment] = relationship("Assessment", back_populates="scores")

    __table_args__ = (
        UniqueConstraint("student_id", "assessment_id", name="uq_score_per_assessment"),
        Index("ix_score_student_course", "student_id"),
        Index("ix_score_assessment", "assessment_id"),
    )
