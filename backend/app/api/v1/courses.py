from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser, RequireFaculty, RequireAdmin
from app.core.database import get_db
from app.models.course import Course, CourseFaculty, Enrollment, SyllabusTopic
from app.models.user import User, UserRole

router = APIRouter(prefix="/courses", tags=["courses"])

class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=200)
    description: str = ""

class CourseOut(BaseModel):
    id: str; code: str; name: str; description: str; is_active: bool
    model_config = {"from_attributes": True}

@router.get("", response_model=list[CourseOut])
async def list_courses(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if current_user.role == UserRole.ADMIN.value:
        result = await db.execute(select(Course).where(Course.is_active == True))
    elif current_user.role == UserRole.FACULTY.value:
        result = await db.execute(
            select(Course).join(CourseFaculty, CourseFaculty.course_id == Course.id)
            .where(CourseFaculty.faculty_id == current_user.id, Course.is_active == True)
        )
    else:
        result = await db.execute(
            select(Course).join(Enrollment, Enrollment.course_id == Course.id)
            .where(Enrollment.student_id == current_user.id, Course.is_active == True)
        )
    return [CourseOut(id=str(c.id), code=c.code, name=c.name, description=c.description, is_active=c.is_active) for c in result.scalars()]

@router.post("", response_model=CourseOut, status_code=201, dependencies=[RequireAdmin])
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Course).where(Course.code == body.code.upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Course code already exists.")
    c = Course(code=body.code.upper(), name=body.name, description=body.description)
    db.add(c); await db.flush()
    return CourseOut(id=str(c.id), code=c.code, name=c.name, description=c.description, is_active=c.is_active)

@router.get("/{course_id}", response_model=CourseOut)
async def get_course(course_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    c = await db.get(Course, course_id)
    if not c:
        raise HTTPException(404, "Course not found.")
    return CourseOut(id=str(c.id), code=c.code, name=c.name, description=c.description, is_active=c.is_active)

@router.get("/{course_id}/students")
async def list_course_students(course_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if current_user.role == UserRole.FACULTY.value:
        cf = await db.execute(select(CourseFaculty).where(CourseFaculty.course_id == course_id, CourseFaculty.faculty_id == current_user.id))
        if not cf.scalar_one_or_none():
            raise HTTPException(403, "Not assigned to this course.")
    elif current_user.role == UserRole.STUDENT.value:
        raise HTTPException(403, "Insufficient permissions.")
    result = await db.execute(select(User).join(Enrollment, Enrollment.student_id == User.id).where(Enrollment.course_id == course_id))
    return [{"id": str(u.id), "first_name": u.first_name, "last_name": u.last_name, "email": u.email} for u in result.scalars()]
