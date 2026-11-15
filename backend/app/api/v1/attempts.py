# ==============================================================================
# PIPELINE / MODEL COMPONENT: Quiz Attempts API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireStudent
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.assessment import Assessment, AssessmentScore, StudentDiagnosticRecord
from app.models.flag import EngagementStats, SupportFlag
from app.models.quiz import QuizAnswer, QuizAttempt, QuizQuestion, QuizSet

logger = get_logger(__name__)
router = APIRouter(prefix="/attempts", tags=["attempts"])


class StartAttemptRequest(BaseModel):
    quiz_set_id: uuid.UUID


class SubmitAnswerRequest(BaseModel):
    question_id: uuid.UUID
    chosen_option: str = Field(pattern="^[ABCD]$")
    time_taken_s: float = Field(default=5.0, ge=0.0, le=3600.0)


class SingleAnswerSubmission(BaseModel):
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    chosen_option: str = Field(pattern="^[ABCD]$")
    time_taken_s: float = Field(default=5.0, ge=0.0, le=3600.0)


class FinishAttemptRequest(BaseModel):
    answers: list[SubmitAnswerRequest] = []
    action: str | None = None


@router.post("/answers", status_code=200, dependencies=[RequireStudent])
async def submit_single_answer(
    body: SingleAnswerSubmission,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Record or update a single answer during an active quiz attempt."""
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == body.attempt_id,
            QuizAttempt.student_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")

    q_res = await db.execute(
        select(QuizQuestion).where(
            QuizQuestion.id == body.question_id,
            QuizQuestion.quiz_set_id == attempt.quiz_set_id,
        )
    )
    question = q_res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found in this quiz.")

    is_correct = body.chosen_option.upper() == question.correct_option.upper()

    existing_ans = await db.execute(
        select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt.id,
            QuizAnswer.question_id == question.id,
        )
    )
    ans_row = existing_ans.scalar_one_or_none()
    if ans_row:
        ans_row.chosen_option = body.chosen_option.upper()
        ans_row.is_correct = is_correct
        ans_row.time_taken_s = body.time_taken_s
    else:
        db.add(
            QuizAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                chosen_option=body.chosen_option.upper(),
                is_correct=is_correct,
                time_taken_s=body.time_taken_s,
            )
        )
    await db.flush()
    return {
        "question_id": str(question.id),
        "chosen_option": body.chosen_option.upper(),
        "is_correct": is_correct,
    }


@router.post("", status_code=201, dependencies=[RequireStudent])
async def start_attempt(
    body: StartAttemptRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Start a quiz attempt. Creates an in-progress attempt record.
    Students can only have one attempt per quiz set.
    """
    # Check quiz is live
    quiz_result = await db.execute(select(QuizSet).where(QuizSet.id == body.quiz_set_id))
    quiz = quiz_result.scalar_one_or_none()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz set not found.")
    if quiz.status != "live":
        raise HTTPException(status_code=400, detail="Quiz is not yet available.")

    # Check for existing attempt
    existing = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.quiz_set_id == body.quiz_set_id,
        )
    )
    existing_attempt = existing.scalar_one_or_none()
    if existing_attempt:
        if existing_attempt.completed_at:
            # Allow student to retake / practice by resetting previous attempt
            await db.execute(delete(QuizAnswer).where(QuizAnswer.attempt_id == existing_attempt.id))
            existing_attempt.completed_at = None
            existing_attempt.score_raw = None
            existing_attempt.score_pct = None
            existing_attempt.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
            existing_attempt.is_resumed = True
            await db.flush()
            return {
                "id": str(existing_attempt.id),
                "quiz_set_id": str(existing_attempt.quiz_set_id),
                "started_at": existing_attempt.started_at.isoformat(),
                "status": "retake_started",
            }
        # Resume existing attempt
        existing_attempt.is_resumed = True
        await db.flush()
        return {
            "id": str(existing_attempt.id),
            "quiz_set_id": str(existing_attempt.quiz_set_id),
            "started_at": existing_attempt.started_at.isoformat(),
            "status": "resumed",
        }

    attempt = QuizAttempt(
        student_id=current_user.id,
        quiz_set_id=body.quiz_set_id,
    )
    db.add(attempt)
    await db.flush()
    logger.info("attempt_started", attempt_id=str(attempt.id), student=str(current_user.id))

    return {
        "id": str(attempt.id),
        "quiz_set_id": str(attempt.quiz_set_id),
        "started_at": attempt.started_at.isoformat(),
        "status": "started",
    }


@router.patch("/{attempt_id}", status_code=200, dependencies=[RequireStudent])
@router.patch("/{attempt_id}/finish", status_code=200, dependencies=[RequireStudent])
async def finish_attempt(
    attempt_id: uuid.UUID,
    current_user: CurrentUser,
    body: FinishAttemptRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit answers and finalize the attempt.
    Scores each answer against the correct option and computes percentage.
    """
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.student_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.completed_at:
        raise HTTPException(status_code=409, detail="Attempt already completed.")

    # Load all questions for this quiz
    q_result = await db.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_set_id == attempt.quiz_set_id)
    )
    questions = {q.id: q for q in q_result.scalars().all()}

    provided_answers = body.answers if (body and body.answers) else []
    if provided_answers:
        correct_count = 0
        for ans in provided_answers:
            question = questions.get(ans.question_id)
            if not question:
                raise HTTPException(status_code=400, detail=f"Question {ans.question_id} not found in this quiz.")

            is_correct = ans.chosen_option.upper() == question.correct_option.upper()
            if is_correct:
                correct_count += 1

            db.add(
                QuizAnswer(
                    attempt_id=attempt.id,
                    question_id=ans.question_id,
                    chosen_option=ans.chosen_option.upper(),
                    is_correct=is_correct,
                    time_taken_s=ans.time_taken_s,
                )
            )
    else:
        existing_ans_res = await db.execute(
            select(QuizAnswer).where(QuizAnswer.attempt_id == attempt.id)
        )
        saved_answers = existing_ans_res.scalars().all()
        if body and body.action is None and not saved_answers:
            raise HTTPException(status_code=400, detail="No answers provided.")
        correct_count = sum(1 for a in saved_answers if a.is_correct)

    total = len(questions)
    attempt.score_raw = float(correct_count)
    attempt.score_pct = round(correct_count / total * 100, 2) if total else 0.0
    attempt.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Update diagnostic record & downstream ecosystem if this was an assigned remedial quiz
    diag_stmt = (
        select(StudentDiagnosticRecord)
        .where(
            StudentDiagnosticRecord.student_id == current_user.id,
            StudentDiagnosticRecord.remedial_quiz_id == attempt.quiz_set_id,
        )
    )
    diag_res = await db.execute(diag_stmt)
    diag_rec = diag_res.scalar_one_or_none()
    if diag_rec:
        diag_rec.remedial_completed = True
        diag_rec.remedial_score = attempt.score_pct

        # Record an AssessmentScore for the remedial quiz so /analytics and /progress reflect mastery
        today = datetime.now(timezone.utc).date()
        rem_ass_res = await db.execute(
            select(Assessment).where(
                Assessment.course_id == diag_rec.course_id,
                Assessment.title == "Targeted Remedial Quiz (20 Questions)",
            ).limit(1)
        )
        rem_ass = rem_ass_res.scalar_one_or_none()
        if not rem_ass:
            rem_ass = Assessment(
                course_id=diag_rec.course_id,
                title="Targeted Remedial Quiz (20 Questions)",
                topic_tag="error_debugging",
                assessment_date=today,
                created_by=diag_rec.evaluated_by or current_user.id,
            )
            db.add(rem_ass)
            await db.flush()

        sc_res = await db.execute(
            select(AssessmentScore).where(
                AssessmentScore.assessment_id == rem_ass.id,
                AssessmentScore.student_id == current_user.id,
            ).limit(1)
        )
        sc_row = sc_res.scalar_one_or_none()
        if not sc_row:
            db.add(
                AssessmentScore(
                    assessment_id=rem_ass.id,
                    student_id=current_user.id,
                    topic_tag=rem_ass.topic_tag,
                    score=attempt.score_pct,
                    max_score=100.0,
                    percentage=round(attempt.score_pct, 1),
                )
            )
        else:
            sc_row.score = attempt.score_pct
            sc_row.max_score = 100.0
            sc_row.percentage = round(attempt.score_pct, 1)

        # Update EngagementStats
        eng_res = await db.execute(
            select(EngagementStats).where(
                EngagementStats.course_id == diag_rec.course_id,
                EngagementStats.student_id == current_user.id,
            ).limit(1)
        )
        eng = eng_res.scalar_one_or_none()
        if eng:
            eng.current_streak += 1
            eng.longest_streak = max(eng.longest_streak, eng.current_streak)
            eng.retention_points += int(attempt.score_pct)
            eng.last_activity_date = attempt.completed_at

        # If student achieved >= 60% mastery on the remedial quiz, mark open SupportFlag as resolved
        if attempt.score_pct >= 60.0:
            fl_res = await db.execute(
                select(SupportFlag).where(
                    SupportFlag.student_id == current_user.id,
                    SupportFlag.course_id == diag_rec.course_id,
                    SupportFlag.status == "open",
                )
            )
            for fl in fl_res.scalars().all():
                fl.status = "resolved"
                fl.override_note = f"Auto-resolved upon achieving {attempt.score_pct}% mastery on the 20-question Targeted Remedial Quiz."

    await db.flush()
    logger.info(
        "attempt_completed",
        attempt_id=str(attempt.id),
        student=str(current_user.id),
        score_pct=attempt.score_pct,
    )

    return {
        "id": str(attempt.id),
        "quiz_set_id": str(attempt.quiz_set_id),
        "started_at": attempt.started_at.isoformat(),
        "score": attempt.score_raw,
        "score_raw": attempt.score_raw,
        "score_pct": attempt.score_pct,
        "correct": correct_count,
        "total": total,
        "completed_at": attempt.completed_at.isoformat(),
    }


@router.get("/{attempt_id}")
async def get_attempt(
    attempt_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve attempt details and answers."""
    result = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.student_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")

    ans_result = await db.execute(
        select(QuizAnswer).where(QuizAnswer.attempt_id == attempt_id)
    )
    answers = ans_result.scalars().all()

    return {
        "id": str(attempt.id),
        "quiz_set_id": str(attempt.quiz_set_id),
        "started_at": attempt.started_at.isoformat(),
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "score_raw": attempt.score_raw,
        "score_pct": attempt.score_pct,
        "answers": [
            {
                "question_id": str(a.question_id),
                "chosen_option": a.chosen_option,
                "is_correct": a.is_correct,
                "time_taken_s": a.time_taken_s,
            }
            for a in answers
        ],
    }
