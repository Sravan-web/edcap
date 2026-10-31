# ==============================================================================
# PIPELINE / MODEL COMPONENT: Analytics API Routes
# TECH STACK: Python / FastAPI / SQLAlchemy
# ==============================================================================
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireFaculty
from app.core.database import get_db
from app.models.assessment import Assessment, AssessmentScore
from app.models.course import Course, CourseFaculty, Enrollment, SyllabusTopic
from app.models.flag import EngagementStats, SupportFlag
from app.models.quiz import QuizAttempt, QuizSet
from app.models.user import User, UserRole

router = APIRouter(prefix="/analytics", tags=["analytics"])


async def _check_course_access(db: AsyncSession, user: User, course_id: uuid.UUID) -> None:
    """Ensure faculty is assigned to the course (admin bypasses)."""
    if user.role == UserRole.ADMIN.value:
        return
    cf = await db.execute(
        select(CourseFaculty).where(
            CourseFaculty.faculty_id == user.id,
            CourseFaculty.course_id == course_id,
        )
    )
    if not cf.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not assigned to this course.")


@router.get("/class", dependencies=[RequireFaculty])
async def class_analytics(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    course_id: uuid.UUID | None = None,
):
    """
    High-level class dashboard analytics.
    Returns per-course summaries for all courses the faculty teaches.
    """
    if course_id:
        await _check_course_access(db, current_user, course_id)
        course_ids = [course_id]
    elif current_user.role == UserRole.ADMIN.value:
        c_result = await db.execute(select(Course.id).where(Course.is_active == True))
        course_ids = [r[0] for r in c_result.all()]
    else:
        cf_result = await db.execute(
            select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id)
        )
        course_ids = [r[0] for r in cf_result.all()]

    summaries = []
    for cid in course_ids:
        # Student count
        student_count_result = await db.execute(
            select(func.count(Enrollment.id)).where(Enrollment.course_id == cid)
        )
        student_count = student_count_result.scalar_one() or 0

        # Open flags
        open_flags_result = await db.execute(
            select(func.count(SupportFlag.id)).where(
                SupportFlag.course_id == cid, SupportFlag.status == "open"
            )
        )
        open_flags = open_flags_result.scalar_one() or 0

        # Flag breakdown by track
        tracks_result = await db.execute(
            select(SupportFlag.track, func.count(SupportFlag.id))
            .where(SupportFlag.course_id == cid, SupportFlag.status == "open")
            .group_by(SupportFlag.track)
        )
        flag_tracks = {row[0]: row[1] for row in tracks_result.all()}

        # Average score on last assessment
        last_assessment_result = await db.execute(
            select(Assessment)
            .where(Assessment.course_id == cid)
            .order_by(Assessment.assessment_date.desc())
            .limit(1)
        )
        last_assessment = last_assessment_result.scalar_one_or_none()
        avg_score = None
        if last_assessment:
            avg_result = await db.execute(
                select(func.avg(AssessmentScore.score / AssessmentScore.max_score * 100)).where(
                    AssessmentScore.assessment_id == last_assessment.id,
                    AssessmentScore.max_score > 0,
                )
            )
            avg_score = round(avg_result.scalar_one() or 0, 1)

        summaries.append(
            {
                "course_id": str(cid),
                "student_count": student_count,
                "open_support_flags": open_flags,
                "flag_by_track": flag_tracks,
                "last_assessment_avg_pct": avg_score,
            }
        )

    return {"courses": summaries}


@router.get("/course/{course_id}", dependencies=[RequireFaculty])
async def course_analytics(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Detailed analytics for a specific course including per-student breakdown.
    """
    await _check_course_access(db, current_user, course_id)

    # Enrolled students
    enr_result = await db.execute(
        select(Enrollment.student_id).where(Enrollment.course_id == course_id)
    )
    student_ids = [r[0] for r in enr_result.all()]

    # Per-student score history (last 5 assessments)
    student_profiles = []
    for sid in student_ids:
        user_result = await db.execute(select(User).where(User.id == sid))
        user = user_result.scalar_one_or_none()
        if not user:
            continue

        scores_result = await db.execute(
            select(AssessmentScore, Assessment)
            .join(Assessment, AssessmentScore.assessment_id == Assessment.id)
            .where(
                AssessmentScore.student_id == sid,
                Assessment.course_id == course_id,
            )
            .order_by(Assessment.assessment_date.desc())
            .limit(5)
        )
        score_rows = scores_result.all()
        scores = [
            {
                "assessment_date": str(a.assessment_date),
                "topic_tag": a.topic_tag,
                "pct": round(s.score / s.max_score * 100, 1) if s.max_score else 0,
            }
            for s, a in score_rows
        ]

        # Active flags
        flag_result = await db.execute(
            select(func.count(SupportFlag.id)).where(
                SupportFlag.student_id == sid,
                SupportFlag.course_id == course_id,
                SupportFlag.status == "open",
            )
        )
        open_flags = flag_result.scalar_one() or 0

        # Engagement
        eng_result = await db.execute(
            select(EngagementStats).where(
                EngagementStats.student_id == sid,
                EngagementStats.course_id == course_id,
            )
        )
        eng = eng_result.scalar_one_or_none()

        student_profiles.append(
            {
                "student_id": str(sid),
                "name": f"{user.first_name} {user.last_name}",
                "recent_scores": scores,
                "open_flags": open_flags,
                "current_streak": eng.current_streak if eng else 0,
                "retention_points": eng.retention_points if eng else 0,
            }
        )

    # Topic-level accuracy
    topics_result = await db.execute(
        select(SyllabusTopic).where(SyllabusTopic.course_id == course_id)
    )
    topics = topics_result.scalars().all()
    topic_accuracy = []
    for t in topics:
        acc_result = await db.execute(
            select(
                func.avg(AssessmentScore.score / AssessmentScore.max_score * 100)
            ).join(Assessment, AssessmentScore.assessment_id == Assessment.id)
            .where(
                Assessment.course_id == course_id,
                Assessment.topic_tag == t.tag,
                AssessmentScore.max_score > 0,
            )
        )
        avg_acc = acc_result.scalar_one()
        if avg_acc is not None:
            topic_accuracy.append(
                {
                    "topic_id": str(t.id),
                    "topic_name": t.name,
                    "tag": t.tag,
                    "avg_accuracy_pct": round(avg_acc, 1),
                }
            )

    return {
        "course_id": str(course_id),
        "total_students": len(student_ids),
        "student_profiles": student_profiles,
        "topic_accuracy": sorted(topic_accuracy, key=lambda x: x["avg_accuracy_pct"]),
    }
