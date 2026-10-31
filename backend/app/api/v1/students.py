# ==============================================================================
# PIPELINE / MODEL COMPONENT: Students API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireFaculty
from app.core.database import get_db
from app.models.assessment import Assessment, AssessmentScore
from app.models.course import Enrollment, SyllabusTopic
from app.models.flag import EngagementStats, RemedialQueueItem, SupportFlag
from app.models.quiz import QuizAttempt, QuizSet
from app.models.user import User, UserRole

from app.api.v1.flags import _parse_reasons, _parse_top_features

router = APIRouter(prefix="/students", tags=["students"])


def _check_faculty_or_self(current_user: User, student_id: uuid.UUID) -> None:
    if current_user.role == UserRole.STUDENT.value and current_user.id != student_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")


@router.get("/{student_id}/profile")
async def get_student_profile(
    student_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a student's profile summary.
    Faculty/Admin may view any student; students may only view themselves.
    """
    _check_faculty_or_self(current_user, student_id)

    result = await db.execute(select(User).where(User.id == student_id))
    student = result.scalar_one_or_none()
    if not student or student.role != UserRole.STUDENT.value:
        raise HTTPException(status_code=404, detail="Student not found.")

    # Enrollments
    enr = await db.execute(select(Enrollment).where(Enrollment.student_id == student_id))
    enrollments = enr.scalars().all()

    # Engagement across all courses
    eng = await db.execute(
        select(EngagementStats).where(EngagementStats.student_id == student_id)
    )
    engagement_rows = eng.scalars().all()
    total_streak = max((e.current_streak for e in engagement_rows), default=0)
    total_points = sum(e.retention_points for e in engagement_rows)

    # Open flags count
    flags = await db.execute(
        select(func.count(SupportFlag.id)).where(
            SupportFlag.student_id == student_id,
            SupportFlag.status == "open",
        )
    )
    open_flags = flags.scalar_one() or 0

    return {
        "id": str(student.id),
        "email": student.email,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "status": student.status,
        "theme": student.theme,
        "font_preference": student.font_preference,
        "mfa_enabled": student.mfa_enabled,
        "created_at": student.created_at.isoformat(),
        "enrolled_courses": [str(e.course_id) for e in enrollments],
        "current_streak": total_streak,
        "retention_points": total_points,
        "open_support_flags": open_flags,
    }


@router.get("/{student_id}/flags")
async def get_student_flags(
    student_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
):
    """Return support flags for a student."""
    _check_faculty_or_self(current_user, student_id)

    query = select(SupportFlag).where(SupportFlag.student_id == student_id)
    if status_filter:
        query = query.where(SupportFlag.status == status_filter)
    query = query.order_by(SupportFlag.created_at.desc())

    result = await db.execute(query)
    flags = result.scalars().all()

    return [
        {
            "id": str(f.id),
            "course_id": str(f.course_id),
            "topic_id": str(f.topic_id) if f.topic_id else None,
            "track": f.track,
            "risk_score": f.risk_score,
            "reasons": _parse_reasons(f.reasons),
            "top_features": _parse_top_features(f.top_features),
            "status": f.status,
            "override_track": f.override_track,
            "override_note": f.override_note,
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat(),
        }
        for f in flags
    ]


@router.get("/{student_id}/remedial-queue")
async def get_student_remedial_queue(
    student_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return the spaced-repetition queue for a student."""
    _check_faculty_or_self(current_user, student_id)

    result = await db.execute(
        select(RemedialQueueItem)
        .where(RemedialQueueItem.student_id == student_id)
        .order_by(RemedialQueueItem.next_review_at)
    )
    items = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "topic_id": str(i.topic_id),
            "course_id": str(i.course_id),
            "next_review_at": i.next_review_at.isoformat(),
            "interval_days": i.interval_days,
            "repetition_count": i.repetition_count,
            "last_result": i.last_result,
        }
        for i in items
    ]


@router.get("/{student_id}/assessment-history")
async def get_student_assessment_history(
    student_id: uuid.UUID,
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return assessment score history for a student in a course."""
    _check_faculty_or_self(current_user, student_id)

    result = await db.execute(
        select(AssessmentScore, Assessment)
        .join(Assessment, AssessmentScore.assessment_id == Assessment.id)
        .where(
            AssessmentScore.student_id == student_id,
            Assessment.course_id == course_id,
        )
        .order_by(Assessment.assessment_date.desc())
    )
    rows = result.all()
    return [
        {
            "assessment_id": str(score.id),
            "assessment_title": assessment.title,
            "assessment_date": str(assessment.assessment_date),
            "topic_tag": assessment.topic_tag,
            "score": score.score,
            "max_score": score.max_score,
            "percentage": round(score.score / score.max_score * 100, 1) if score.max_score else 0,
        }
        for score, assessment in rows
    ]
