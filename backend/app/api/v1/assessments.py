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
from app.models.assessment import Assessment, AssessmentScore
from app.models.course import CourseFaculty, Enrollment
from app.models.user import UserRole
from app.services import assessment_service

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
