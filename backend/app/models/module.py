# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Lesson Modules
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import GUID, utcnow


class LessonModule(Base):
    __tablename__ = "lesson_modules"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    taught_on: Mapped[date] = mapped_column(Date, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(300), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(300), nullable=False)  # random server-side name
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)  # pdf | markdown
    file_size_bytes: Mapped[int] = mapped_column(nullable=False)
    parse_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | ok | failed
    parse_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_chunks: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of {text, section, page}
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_module_course_date", "course_id", "taught_on"),
    )
