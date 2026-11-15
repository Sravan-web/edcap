# ==============================================================================
# PIPELINE / MODEL COMPONENT: Assessment API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireFaculty
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import hash_password
from app.models.assessment import Assessment, AssessmentScore
from app.models.course import CourseFaculty, Enrollment
from app.models.user import UserRole, User
from app.services import assessment_service, diagnostic_service

settings = get_settings()
router = APIRouter(prefix="/assessments", tags=["assessments"])


class AssessmentCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    assessment_date: date
    topic_tag: str = Field(min_length=1, max_length=100)


class AssessmentOut(BaseModel):
    id: str
    course_id: str
    title: str
    assessment_date: str
    topic_tag: str
    source: str


@router.get("/template", response_class=PlainTextResponse)
async def download_template():
    """Download the CSV import template."""
    return PlainTextResponse(
        content=assessment_service.CSV_TEMPLATE,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=assessment_import_template.csv"},
    )


@router.post("/import", status_code=201, dependencies=[RequireFaculty])
async def import_csv(
    request: Request,
    course_id: uuid.UUID,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload and import an assessment CSV file."""
    # ── File validation ────────────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only CSV files are accepted (extension .csv).")

    content_type = file.content_type or ""
    allowed_types = {"text/csv", "application/csv", "text/plain"}
    if content_type and content_type not in allowed_types:
        raise HTTPException(400, "Invalid MIME type. Upload a CSV file.")

    content = await file.read()
    if len(content) > settings.upload_max_csv_bytes:
        raise HTTPException(413, f"File exceeds the {settings.UPLOAD_MAX_CSV_MB} MB limit.")

    # ── Faculty course ownership ───────────────────────────────────────────────
    if current_user.role == UserRole.FACULTY.value:
        from app.models.course import CourseFaculty
        cf = await db.execute(
            select(CourseFaculty).where(
                CourseFaculty.faculty_id == current_user.id,
                CourseFaculty.course_id == course_id,
            )
        )
        if not cf.scalar_one_or_none():
            raise HTTPException(403, "You are not assigned to this course.")

    result = await assessment_service.import_assessment_csv(
        db, content=content, faculty_id=current_user.id, course_id=course_id
    )

    if result.row_errors:
        return {
            "status": "error",
            "message": "Import failed due to validation errors. No data was imported.",
            "total_rows": result.total_rows,
            "row_errors": result.row_errors,
        }

    return {
        "status": "success",
        "total_rows": result.total_rows,
        "imported_rows": result.imported_rows,
        "assessment_ids": result.assessment_ids,
    }


@router.post("", response_model=AssessmentOut, status_code=201, dependencies=[RequireFaculty])
async def create_assessment(
    body: AssessmentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new assessment record for a course."""
    if current_user.role == UserRole.FACULTY.value:
        cf = await db.execute(
            select(CourseFaculty).where(
                CourseFaculty.faculty_id == current_user.id,
                CourseFaculty.course_id == body.course_id,
            )
        )
        if not cf.scalar_one_or_none():
            raise HTTPException(403, "Not assigned to this course.")
    assessment = Assessment(
        course_id=body.course_id,
        title=body.title,
        assessment_date=body.assessment_date,
        topic_tag=body.topic_tag,
        source="manual",
        created_by=current_user.id,
    )
    db.add(assessment)
    await db.flush()
    return AssessmentOut(
        id=str(assessment.id),
        course_id=str(assessment.course_id),
        title=assessment.title,
        assessment_date=str(assessment.assessment_date),
        topic_tag=assessment.topic_tag,
        source=assessment.source,
    )


@router.get("")
async def list_assessments(
    current_user: CurrentUser,
    course_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List assessments for a course (or all accessible courses if course_id is omitted)."""
    query = select(Assessment)
    if course_id:
        if current_user.role == UserRole.FACULTY.value:
            cf = await db.execute(select(CourseFaculty).where(CourseFaculty.faculty_id == current_user.id, CourseFaculty.course_id == course_id))
            if not cf.scalar_one_or_none():
                raise HTTPException(403, "Not assigned to this course.")
        elif current_user.role == UserRole.STUDENT.value:
            en = await db.execute(select(Enrollment).where(Enrollment.student_id == current_user.id, Enrollment.course_id == course_id))
            if not en.scalar_one_or_none():
                raise HTTPException(403, "Not enrolled in this course.")
        query = query.where(Assessment.course_id == course_id)
    else:
        if current_user.role == UserRole.FACULTY.value:
            cf_res = await db.execute(select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id))
            query = query.where(Assessment.course_id.in_([r[0] for r in cf_res.all()]))
        elif current_user.role == UserRole.STUDENT.value:
            en_res = await db.execute(select(Enrollment.course_id).where(Enrollment.student_id == current_user.id))
            query = query.where(Assessment.course_id.in_([r[0] for r in en_res.all()]))

    result = await db.execute(query.order_by(Assessment.assessment_date.desc()))
    assessments = result.scalars().all()
    return [
        AssessmentOut(
            id=str(a.id),
            course_id=str(a.course_id),
            title=a.title,
            assessment_date=str(a.assessment_date),
            topic_tag=a.topic_tag,
            source=a.source,
        )
        for a in assessments
    ]


# ── Slow Learner Diagnostics (Research Paper: Sangeeta et al., 2020) ─────────

class DiagnosticEvaluatePayload(BaseModel):
    course_id: uuid.UUID
    student_id: uuid.UUID | None = None
    roll_number: str | None = Field(default=None, max_length=50)
    student_name: str = Field(min_length=2, max_length=150)
    mid1_marks: float | None = Field(default=None, ge=0, le=30)
    mid2_marks: float | None = Field(default=None, ge=0, le=30)
    internal_quiz_score: float | None = Field(default=None, ge=0, le=10)
    assignment_score: float | None = Field(default=None, ge=0, le=10)
    attendance_percentage: float | None = Field(default=None, ge=0, le=100)
    lab_score: float | None = Field(default=None, ge=0, le=20)
    participation_index: float | None = Field(default=None, ge=1, le=5)
    marks: float = Field(default=50.0, ge=0, le=100)
    class_performance: float = Field(default=3.0, ge=1, le=5)
    cgpa: float = Field(default=6.5, ge=0, le=10)
    urban_rural: str = Field(default="Urban")
    analytical_thinking: float = Field(default=3.0, ge=1, le=5)
    knowledge_level: float = Field(default=3.0, ge=1, le=5)
    problem_solving_skills: float = Field(default=3.0, ge=1, le=5)
    decision_making: float = Field(default=3.0, ge=1, le=5)
    errors: float = Field(default=3.0, ge=1, le=5)
    auto_assign_remedial: bool = True


@router.get("/diagnostic/summary", dependencies=[RequireFaculty])
async def get_diagnostic_summary(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all student diagnostic records, ML tier distributions, and correlation graphs."""
    summary = await diagnostic_service.get_course_diagnostic_summary(
        db,
        course_id=course_id,
        faculty_id=current_user.id,
    )
    return summary


@router.post("/diagnostic/evaluate", dependencies=[RequireFaculty])
async def evaluate_diagnostic_parameters(
    payload: DiagnosticEvaluatePayload,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Evaluate student parameters using the ML ensemble + classroom metrics and classify into Slow, Moderate, or Advanced."""
    from app.services.bulk_diagnostic_service import compute_classroom_metrics_and_mapping

    # If standardized classroom marks (mid1_marks, mid2_marks, etc.) were submitted, compute derived metrics
    computed_metrics = None
    if payload.mid1_marks is not None and payload.mid2_marks is not None:
        computed_metrics = compute_classroom_metrics_and_mapping(
            mid1_marks=payload.mid1_marks,
            mid2_marks=payload.mid2_marks,
            internal_quiz_score=payload.internal_quiz_score if payload.internal_quiz_score is not None else 5.0,
            assignment_score=payload.assignment_score if payload.assignment_score is not None else 5.0,
            attendance_percentage=payload.attendance_percentage if payload.attendance_percentage is not None else 80.0,
            lab_score=payload.lab_score,
            participation_index=payload.participation_index if payload.participation_index is not None else payload.class_performance,
        )

    # Resolve or create student user
    student_uuid = payload.student_id
    if not student_uuid:
        clean_name = payload.student_name.strip()
        parts = clean_name.split()
        first_name = parts[0] if parts else "Student"
        last_name = " ".join(parts[1:]) if len(parts) > 1 else "Learner"
        if payload.roll_number and payload.roll_number.strip():
            import re
            slug = re.sub(r"[^a-z0-9]", "", payload.roll_number.strip().lower())
            mock_email = f"{slug}@edcap.demo"
        else:
            mock_email = f"student_{clean_name.lower().replace(' ', '_')}@edcap.demo"

        user_stmt = select(User).where(User.email == mock_email).limit(1)
        res = await db.execute(user_stmt)
        existing_u = res.scalar_one_or_none()
        if existing_u:
            student_uuid = existing_u.id
            existing_u.first_name = first_name
            existing_u.last_name = last_name
        else:
            new_u = User(
                email=mock_email,
                first_name=first_name,
                last_name=last_name,
                password_hash=hash_password("Password123!"),
                role=UserRole.STUDENT.value,
            )
            db.add(new_u)
            await db.flush()
            db.add(Enrollment(student_id=new_u.id, course_id=payload.course_id))
            await db.flush()
            student_uuid = new_u.id

    record = await diagnostic_service.evaluate_student_parameters(
        db,
        faculty_id=current_user.id,
        course_id=payload.course_id,
        student_id=student_uuid,
        student_name=payload.student_name,
        marks=computed_metrics["marks"] if computed_metrics else payload.marks,
        class_performance=computed_metrics["class_performance"] if computed_metrics else payload.class_performance,
        cgpa=computed_metrics["cgpa"] if computed_metrics else payload.cgpa,
        urban_rural=payload.urban_rural,
        analytical_thinking=computed_metrics["analytical_thinking"] if computed_metrics else payload.analytical_thinking,
        knowledge_level=computed_metrics["knowledge_level"] if computed_metrics else payload.knowledge_level,
        problem_solving_skills=computed_metrics["problem_solving_skills"] if computed_metrics else payload.problem_solving_skills,
        decision_making=computed_metrics["decision_making"] if computed_metrics else payload.decision_making,
        errors=computed_metrics["errors"] if computed_metrics else payload.errors,
        auto_assign_remedial=payload.auto_assign_remedial,
        roll_number=payload.roll_number,
        mid1_marks=computed_metrics["mid1_marks"] if computed_metrics else payload.mid1_marks,
        mid2_marks=computed_metrics["mid2_marks"] if computed_metrics else payload.mid2_marks,
        internal_quiz_score=computed_metrics["internal_quiz_score"] if computed_metrics else payload.internal_quiz_score,
        assignment_score=computed_metrics["assignment_score"] if computed_metrics else payload.assignment_score,
        attendance_percentage=computed_metrics["attendance_percentage"] if computed_metrics else payload.attendance_percentage,
        lab_score=computed_metrics["lab_score"] if computed_metrics else payload.lab_score,
        participation_index=computed_metrics["participation_index"] if computed_metrics else payload.participation_index,
        aggregate_percentage=computed_metrics["aggregate_percentage"] if computed_metrics else payload.marks,
        risk_score=computed_metrics["risk_score"] if computed_metrics else None,
        category_override=computed_metrics["category"] if computed_metrics else None,
        tier_override=computed_metrics["tier"] if computed_metrics else None,
    )

    await db.commit()

    return {
        "status": "success",
        "student_id": str(record.student_id),
        "roll_number": record.roll_number,
        "student_name": payload.student_name,
        "aggregate_percentage": record.aggregate_percentage,
        "risk_score": record.risk_score,
        "category": record.category,
        "tier": record.tier,
        "learner_score": record.learner_score,
        "is_slow_learner": record.is_slow_learner,
        "confidence": record.confidence,
        "remedial_assigned": record.remedial_assigned,
        "remedial_quiz_id": str(record.remedial_quiz_id) if record.remedial_quiz_id else None,
    }


class GenerateTopicQuizPayload(BaseModel):
    course_id: uuid.UUID
    topic_key: str = Field(min_length=2, max_length=200)
    syllabus_unit: str = Field(default="Unit I — Core Concepts", max_length=200)
    difficulty: str = Field(default="easy", pattern="^(easy|medium|hard)$")
    key_notes: str = Field(default="", max_length=2000)
    assign_to_developing: bool = True


@router.post("/diagnostic/generate-quiz", dependencies=[RequireFaculty])
async def generate_targeted_remedial_quiz(
    payload: GenerateTopicQuizPayload,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Dynamically generate a 20-question targeted remedial quiz from faculty topic keys and assign to Developing learners."""
    res = await diagnostic_service.generate_topic_remedial_quiz(
        db,
        course_id=payload.course_id,
        faculty_id=current_user.id,
        topic_key=payload.topic_key,
        syllabus_unit=payload.syllabus_unit,
        difficulty=payload.difficulty,
        key_notes=payload.key_notes,
        assign_to_developing=payload.assign_to_developing,
    )
    await db.commit()
    return {
        "status": "success",
        "message": f"Generated {res['question_count']}-question remedial quiz for '{res['topic_key']}' and assigned to {res['assigned_developing_count']} Developing learners.",
        **res,
    }


@router.post("/diagnostic/assign-remedial", dependencies=[RequireFaculty])
async def assign_remedial_quizzes(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Assign targeted remedial quiz to all unassigned Developing students in the cohort."""
    count = await diagnostic_service.assign_remedial_for_developing_students(
        db,
        course_id=course_id,
        faculty_id=current_user.id,
    )
    await db.commit()
    return {
        "status": "success",
        "assigned_count": count,
        "message": f"Successfully assigned targeted remedial quiz to {count} Developing students.",
    }

