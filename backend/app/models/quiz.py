# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Quiz Sets, Questions, Attempts, Answers
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
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


class QuizStatus(str):
    DRAFT = "draft"
    APPROVED = "approved"
    LIVE = "live"
    ARCHIVED = "archived"


class QuizSet(Base):
    __tablename__ = "quiz_sets"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("lesson_modules.id"), nullable=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    generation_attempt: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    questions: Mapped[list[QuizQuestion]] = relationship("QuizQuestion", back_populates="quiz_set", cascade="all, delete-orphan")
    attempts: Mapped[list[QuizAttempt]] = relationship("QuizAttempt", back_populates="quiz_set")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    quiz_set_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("quiz_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    question_type: Mapped[str] = mapped_column(String(30), nullable=False)  # core | application | prerequisite_check
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, nullable=False)
    option_b: Mapped[str] = mapped_column(Text, nullable=False)
    option_c: Mapped[str] = mapped_column(Text, nullable=False)
    option_d: Mapped[str] = mapped_column(Text, nullable=False)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False)  # A|B|C|D
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    source_module_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("lesson_modules.id"), nullable=True)
    source_section: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")  # easy|medium|hard
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_by_faculty: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    quiz_set: Mapped[QuizSet] = relationship("QuizSet", back_populates="questions")
    answers: Mapped[list[QuizAnswer]] = relationship("QuizAnswer", back_populates="question")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quiz_set_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("quiz_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score_raw: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_resumed: Mapped[bool] = mapped_column(Boolean, default=False)

    quiz_set: Mapped[QuizSet] = relationship("QuizSet", back_populates="attempts")
    answers: Mapped[list[QuizAnswer]] = relationship("QuizAnswer", back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("student_id", "quiz_set_id", name="uq_one_attempt_per_quiz"),
    )


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    chosen_option: Mapped[str] = mapped_column(String(1), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    time_taken_s: Mapped[float] = mapped_column(Float, default=0.0)
    answered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    attempt: Mapped[QuizAttempt] = relationship("QuizAttempt", back_populates="answers")
    question: Mapped[QuizQuestion] = relationship("QuizQuestion", back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_answer_per_question"),
    )
