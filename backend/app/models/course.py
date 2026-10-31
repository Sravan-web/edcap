# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Courses, Enrollments, Syllabus
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
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


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    enrollments: Mapped[list[Enrollment]] = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    faculty_links: Mapped[list[CourseFaculty]] = relationship("CourseFaculty", back_populates="course", cascade="all, delete-orphan")
    syllabus_topics: Mapped[list[SyllabusTopic]] = relationship("SyllabusTopic", back_populates="course", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    course: Mapped[Course] = relationship("Course", back_populates="enrollments")

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_enrollment"),
        Index("ix_enrollment_student", "student_id"),
        Index("ix_enrollment_course", "course_id"),
    )


class CourseFaculty(Base):
    __tablename__ = "course_faculty"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    faculty_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    course: Mapped[Course] = relationship("Course", back_populates="faculty_links")

    __table_args__ = (
        UniqueConstraint("faculty_id", "course_id", name="uq_course_faculty"),
        Index("ix_course_faculty_faculty", "faculty_id"),
        Index("ix_course_faculty_course", "course_id"),
    )


class SyllabusTopic(Base):
    __tablename__ = "syllabus_topics"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    tag: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    parent_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("syllabus_topics.id"), nullable=True)
    prerequisite_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of UUIDs
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    course: Mapped[Course] = relationship("Course", back_populates="syllabus_topics")
    children: Mapped[list[SyllabusTopic]] = relationship("SyllabusTopic", back_populates="parent")
    parent: Mapped[SyllabusTopic | None] = relationship("SyllabusTopic", back_populates="children", remote_side="SyllabusTopic.id")
