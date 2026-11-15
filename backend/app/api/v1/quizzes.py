from __future__ import annotations
import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser, RequireFaculty, MFAStepUpRequired
from app.core.database import get_db
from app.models.course import Course, CourseFaculty, Enrollment
from app.models.quiz import QuizAttempt, QuizQuestion, QuizSet
from app.models.user import UserRole
from app.services import quiz_service

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

class GenerateRequest(BaseModel):
    module_id: uuid.UUID; course_id: uuid.UUID; scheduled_date: date | None = None

class QuestionPatch(BaseModel):
    stem: str | None = None; option_a: str | None = None; option_b: str | None = None
    option_c: str | None = None; option_d: str | None = None
    correct_option: str | None = Field(None, pattern="^[ABCD]$")
    explanation: str | None = None


def _format_question(q: QuizQuestion, include_answer: bool = True) -> dict:
    base = {
        "id": str(q.id),
        "type": q.question_type,
        "stem": q.stem,
        "question_text": q.stem,
        "option_a": q.option_a,
        "option_b": q.option_b,
        "option_c": q.option_c,
        "option_d": q.option_d,
        "options": {"A": q.option_a, "B": q.option_b, "C": q.option_c, "D": q.option_d},
        "difficulty": q.difficulty,
        "source_section": q.source_section,
        "correct_option": q.correct_option,
        "explanation": q.explanation,
    }
    if include_answer:
        base["is_approved"] = q.is_approved
    return base


async def _ensure_demo_live_quiz(db: AsyncSession, course_id: uuid.UUID, today: date, creator_id: uuid.UUID) -> QuizSet:
    """Create or ensure a default 20-question live quiz for the course."""
    from app.services.diagnostic_service import ensure_remedial_quiz_set
    cf_res = await db.execute(select(CourseFaculty.faculty_id).where(CourseFaculty.course_id == course_id).limit(1))
    faculty_id = cf_res.scalar_one_or_none() or creator_id
    return await ensure_remedial_quiz_set(db, course_id=course_id, creator_id=faculty_id)


@router.get("/assigned-remedial")
async def get_assigned_remedial_quiz(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve targeted remedial quiz and diagnostic record for the student."""
    from app.models.assessment import StudentDiagnosticRecord
    from app.services.diagnostic_service import ensure_remedial_quiz_set, seed_demo_cohort_if_empty
    import json

    # Ensure demo cohort is seeded if student is enrolled in a course
    enr_res = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == current_user.id).limit(1))
    student_course_id = enr_res.scalar_one_or_none()
    if not student_course_id:
        c_res = await db.execute(select(Course.id).where(Course.is_active == True).limit(1))
        student_course_id = c_res.scalar_one_or_none()
    if student_course_id:
        cf_res = await db.execute(select(CourseFaculty.faculty_id).where(CourseFaculty.course_id == student_course_id).limit(1))
        fac_id = cf_res.scalar_one_or_none() or current_user.id
        await seed_demo_cohort_if_empty(db, course_id=student_course_id, faculty_id=fac_id)

    stmt = (
        select(StudentDiagnosticRecord)
        .where(StudentDiagnosticRecord.student_id == current_user.id)
        .order_by(StudentDiagnosticRecord.created_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    rec = res.scalar_one_or_none()
    if not rec:
        return {"has_remedial": False, "quiz": None, "diagnostic": None}

    diag_payload = {
        "tier": rec.tier,
        "learner_score": rec.learner_score,
        "marks": rec.marks,
        "cgpa": rec.cgpa,
        "class_performance": rec.class_performance,
        "analytical_thinking": rec.analytical_thinking,
        "knowledge_level": rec.knowledge_level,
        "problem_solving_skills": rec.problem_solving_skills,
        "decision_making": rec.decision_making,
        "errors": rec.errors,
        "weak_dimensions": json.loads(rec.weak_dimensions) if rec.weak_dimensions else [],
        "radar_data": json.loads(rec.radar_data) if rec.radar_data else {},
        "model_votes": json.loads(rec.model_votes) if rec.model_votes else {},
    }

    if rec.tier != "Developing" or not rec.remedial_assigned:
        return {"has_remedial": False, "quiz": None, "diagnostic": diag_payload}

    # Ensure the remedial quiz has all 20 questions
    qs = await ensure_remedial_quiz_set(db, course_id=rec.course_id, creator_id=rec.evaluated_by or current_user.id)
    rec.remedial_quiz_id = qs.id
    await db.commit()

    q_res = await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_set_id == qs.id).order_by(QuizQuestion.sort_order)
    )
    questions = q_res.scalars().all()

    att_res = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.quiz_set_id == qs.id,
        ).limit(1)
    )
    attempt = att_res.scalar_one_or_none()

    return {
        "has_remedial": True,
        "is_completed": bool(attempt and attempt.completed_at),
        "score_pct": attempt.score_pct if attempt else None,
        "quiz": {
            "id": str(qs.id),
            "course_id": str(qs.course_id),
            "title": "Targeted Remedial Quiz: Logic, Fundamentals & Error Debugging",
            "date": str(qs.scheduled_date),
            "scheduled_date": str(qs.scheduled_date),
            "status": qs.status,
            "questions": [_format_question(q) for q in questions],
        },
        "diagnostic": diag_payload,
    }


@router.get("/today")
async def get_today_quiz_default(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    course_id: uuid.UUID | None = None,
):
    today = datetime.now(timezone.utc).date()
    target_course_id = course_id
    if not target_course_id:
        if current_user.role == UserRole.STUDENT.value:
            enr = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == current_user.id).limit(1))
            target_course_id = enr.scalar_one_or_none()
        elif current_user.role == UserRole.FACULTY.value:
            cf = await db.execute(select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id).limit(1))
            target_course_id = cf.scalar_one_or_none()
        if not target_course_id:
            c_res = await db.execute(select(Course.id).where(Course.is_active == True).limit(1))
            target_course_id = c_res.scalar_one_or_none()

    if not target_course_id:
        raise HTTPException(404, "No course found for daily quiz.")

    qs = await _ensure_demo_live_quiz(db, target_course_id, today, current_user.id)
    await db.commit()

    q_res = await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_set_id == qs.id).order_by(QuizQuestion.sort_order)
    )
    questions = q_res.scalars().all()
    return {
        "id": str(qs.id),
        "course_id": str(qs.course_id),
        "date": str(qs.scheduled_date),
        "scheduled_date": str(qs.scheduled_date),
        "status": qs.status,
        "questions": [_format_question(q) for q in questions],
    }


@router.get("/today/{course_id}")
async def get_today_quiz(course_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(QuizSet).where(QuizSet.course_id == course_id, QuizSet.scheduled_date == today, QuizSet.status == "live")
    )
    qs = result.scalar_one_or_none()
    if not qs:
        return {"quiz_available": False}
    return {"quiz_available": True, "quiz_set_id": str(qs.id)}


@router.post("/generate", status_code=201, dependencies=[RequireFaculty])
async def generate_quiz(body: GenerateRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    try:
        quiz_set = await quiz_service.generate_quiz(db, module_id=body.module_id, course_id=body.course_id,
                                                    faculty_id=current_user.id, scheduled_date=body.scheduled_date)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"quiz_set_id": str(quiz_set.id), "status": quiz_set.status, "question_count": len(quiz_set.questions)}

@router.get("/{quiz_id}")
async def get_quiz(quiz_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    qs = await db.get(QuizSet, quiz_id)
    if not qs:
        raise HTTPException(404, "Quiz not found.")
    if current_user.role == UserRole.STUDENT.value and qs.status != "live":
        raise HTTPException(404, "Quiz not found.")
    result = await db.execute(select(QuizQuestion).where(QuizQuestion.quiz_set_id == quiz_id).order_by(QuizQuestion.sort_order))
    questions = result.scalars().all()
    return {
        "id": str(qs.id),
        "course_id": str(qs.course_id),
        "date": str(qs.scheduled_date),
        "status": qs.status,
        "scheduled_date": str(qs.scheduled_date),
        "questions": [_format_question(q, include_answer=(current_user.role != UserRole.STUDENT.value)) for q in questions],
    }

@router.patch("/{quiz_id}/questions/{question_id}", dependencies=[RequireFaculty])
async def patch_question(quiz_id: uuid.UUID, question_id: uuid.UUID, body: QuestionPatch, db: AsyncSession = Depends(get_db)):
    q = await db.get(QuizQuestion, question_id)
    if not q or str(q.quiz_set_id) != str(quiz_id):
        raise HTTPException(404, "Question not found.")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(q, field, val)
    q.edited_by_faculty = True
    await db.flush()
    return {"id": str(q.id), "message": "Question updated."}

@router.post("/{quiz_id}/approve", dependencies=[RequireFaculty, MFAStepUpRequired])
async def approve_quiz(quiz_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    qs = await db.get(QuizSet, quiz_id)
    if not qs:
        raise HTTPException(404, "Quiz not found.")
    if qs.status != "draft":
        raise HTTPException(400, f"Quiz is already {qs.status}.")
    result = await db.execute(select(QuizQuestion).where(QuizQuestion.quiz_set_id == quiz_id))
    questions = result.scalars().all()
    if len(questions) != 20:
        raise HTTPException(422, f"Quiz must have exactly 20 questions (has {len(questions)}).")
    qs.status = "live"
    qs.approved_by = current_user.id
    qs.approved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    for q in questions:
        q.is_approved = True
    await db.flush()
    return {"message": "Quiz approved and is now live.", "quiz_set_id": str(qs.id)}
