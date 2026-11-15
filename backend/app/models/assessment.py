# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Assessments & Scores
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
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


class StudentDiagnosticRecord(Base):
    """
    Stores faculty-entered research paper parameters and ML classification:
    - marks, class_performance, cgpa, urban_rural
    - analytical_thinking, knowledge_level, problem_solving_skills, decision_making, errors
    - predicted tier (Developing, Proficient, Advanced)
    - learner_score (0-100)
    - remedial_quiz_assigned (bool)
    - remedial_quiz_id (UUID | None)
    - remedial_completed (bool)
    - remedial_score (float | None)
    """
    __tablename__ = "student_diagnostics"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    evaluated_by: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)

    # Standardized Classroom Bulk & Individual Parameters
    roll_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    mid1_marks: Mapped[float] = mapped_column(Float, default=15.0)
    mid2_marks: Mapped[float] = mapped_column(Float, default=15.0)
    internal_quiz_score: Mapped[float] = mapped_column(Float, default=5.0)
    assignment_score: Mapped[float] = mapped_column(Float, default=5.0)
    attendance_percentage: Mapped[float] = mapped_column(Float, default=80.0)
    lab_score: Mapped[float] = mapped_column(Float, default=10.0)
    participation_index: Mapped[float] = mapped_column(Float, default=3.0)
    aggregate_percentage: Mapped[float] = mapped_column(Float, default=50.0)
    risk_score: Mapped[float] = mapped_column(Float, default=0.5)
    category: Mapped[str] = mapped_column(String(40), default="Moderate Learner")  # Slow Learner | Moderate Learner | Advanced Learner

    marks: Mapped[float] = mapped_column(Float, nullable=False)
    class_performance: Mapped[float] = mapped_column(Float, nullable=False)
    cgpa: Mapped[float] = mapped_column(Float, nullable=False)
    urban_rural: Mapped[str] = mapped_column(String(20), nullable=False)
    analytical_thinking: Mapped[float] = mapped_column(Float, nullable=False)
    knowledge_level: Mapped[float] = mapped_column(Float, nullable=False)
    problem_solving_skills: Mapped[float] = mapped_column(Float, nullable=False)
    decision_making: Mapped[float] = mapped_column(Float, nullable=False)
    errors: Mapped[float] = mapped_column(Float, nullable=False)

    tier: Mapped[str] = mapped_column(String(30), nullable=False)  # Developing | Proficient | Advanced
    learner_score: Mapped[float] = mapped_column(Float, nullable=False)
    is_slow_learner: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    model_votes: Mapped[str] = mapped_column(Text, default="{}")  # JSON string
    weak_dimensions: Mapped[str] = mapped_column(Text, default="[]")  # JSON string
    radar_data: Mapped[str] = mapped_column(Text, default="{}")  # JSON string

    remedial_quiz_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("quiz_sets.id", ondelete="SET NULL"), nullable=True)
    remedial_assigned: Mapped[bool] = mapped_column(Boolean, default=False)
    remedial_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    remedial_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

