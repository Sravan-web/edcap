from __future__ import annotations
import json, uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser, RequireFaculty
from app.core.config import get_settings
from app.core.database import get_db
from app.models.course import Course, CourseFaculty
from app.models.module import LessonModule
from app.models.user import UserRole
from app.services import module_service

settings = get_settings()
router = APIRouter(prefix="/modules", tags=["modules"])

class ModuleOut(BaseModel):
    id: str
    course_id: str
    taught_on: str
    original_filename: str
    parse_status: str
    file_type: str


class ModuleCreateJSON(BaseModel):
    course_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=10)
    taught_on: date | None = None


async def _ensure_demo_modules(db: AsyncSession, course_id: uuid.UUID, uploader_id: uuid.UUID) -> list[LessonModule]:
    today = datetime.now(timezone.utc).date()
    demo_items = [
        (
            "Lecture_01_Arrays_and_Pointers.md",
            "markdown",
            [
                {"heading": "Arrays & Contiguous Memory", "text": "Arrays store elements in contiguous memory locations allowing O(1) random access by index."},
                {"heading": "Pointer Arithmetic", "text": "Pointers hold memory addresses. Incrementing a pointer advances it by sizeof(type) bytes."},
            ],
        ),
        (
            "Lecture_02_Recursion_and_Call_Stack.md",
            "markdown",
            [
                {"heading": "Base Case & Recursive Step", "text": "Every recursive function requires a terminating base case and a step that reduces problem size."},
                {"heading": "Stack Frames", "text": "Each recursive call pushes an activation frame onto the call stack until the base case is reached."},
            ],
        ),
        (
            "Lecture_03_Sorting_and_Searching.md",
            "markdown",
            [
                {"heading": "Binary Search", "text": "Binary search halves the search space on sorted arrays, achieving O(log n) time complexity."},
                {"heading": "Merge Sort & Quick Sort", "text": "Divide-and-conquer sorting algorithms achieve O(n log n) average time complexity."},
            ],
        ),
    ]
    created: list[LessonModule] = []
    for filename, ftype, chunks in demo_items:
        mod = LessonModule(
            course_id=course_id,
            uploaded_by=uploader_id,
            taught_on=today,
            original_filename=filename,
            stored_filename=f"demo_{filename}",
            file_type=ftype,
            file_size_bytes=sum(len(c["text"]) for c in chunks),
            parse_status="ok",
            parsed_chunks=json.dumps(chunks),
        )
        db.add(mod)
        created.append(mod)
    await db.flush()
    return created


@router.get("", response_model=list[ModuleOut])
async def list_modules(
    current_user: CurrentUser,
    course_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List lesson modules for a course or all accessible courses."""
    query = select(LessonModule)
    target_course_id = course_id
    if target_course_id:
        query = query.where(LessonModule.course_id == target_course_id)
    elif current_user.role == UserRole.FACULTY.value:
        cf_res = await db.execute(select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id))
        cids = [r[0] for r in cf_res.all()]
        if cids:
            target_course_id = cids[0]
            query = query.where(LessonModule.course_id.in_(cids))
    else:
        c_res = await db.execute(select(Course.id).where(Course.is_active == True).limit(1))
        target_course_id = c_res.scalar_one_or_none()

    result = await db.execute(query.order_by(LessonModule.taught_on.desc()))
    modules = list(result.scalars().all())

    if not modules and target_course_id:
        modules = await _ensure_demo_modules(db, target_course_id, current_user.id)

    return [
        ModuleOut(
            id=str(m.id),
            course_id=str(m.course_id),
            taught_on=str(m.taught_on),
            original_filename=m.original_filename,
            parse_status=m.parse_status,
            file_type=m.file_type,
        )
        for m in modules
    ]


@router.post("/json", response_model=ModuleOut, status_code=201, dependencies=[RequireFaculty])
async def create_module_json(
    body: ModuleCreateJSON,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a lecture module directly from text/markdown notes."""
    taught_date = body.taught_on or datetime.now(timezone.utc).date()
    filename = body.title if body.title.endswith(".md") else f"{body.title.replace(' ', '_')}.md"
    raw_bytes = body.content.encode("utf-8")
    stored_name = module_service.save_file(filename, raw_bytes)
    chunks = [{"heading": body.title, "text": body.content}]
    mod = LessonModule(
        course_id=body.course_id,
        uploaded_by=current_user.id,
        taught_on=taught_date,
        original_filename=filename,
        stored_filename=stored_name,
        file_type="markdown",
        file_size_bytes=len(raw_bytes),
        parse_status="ok",
        parsed_chunks=json.dumps(chunks),
    )
    db.add(mod)
    await db.flush()
    return ModuleOut(
        id=str(mod.id),
        course_id=str(mod.course_id),
        taught_on=str(mod.taught_on),
        original_filename=mod.original_filename,
        parse_status=mod.parse_status,
        file_type=mod.file_type,
    )

@router.post("", response_model=ModuleOut, status_code=201, dependencies=[RequireFaculty])
async def upload_module(
    course_id: uuid.UUID,
    topic_id: uuid.UUID | None = None,
    taught_on: date = None,
    current_user: CurrentUser = None,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if taught_on is None:
        from datetime import datetime, timezone
        taught_on = datetime.now(timezone.utc).date()
    content = await file.read()
    try:
        file_type = module_service.validate_upload(file.filename or "", content, settings.upload_max_module_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    stored_name = module_service.save_file(file.filename or "upload", content)
    parse_status = "pending"
    parsed_chunks: list = []
    parse_error = None
    try:
        if file_type == "pdf":
            parsed_chunks = module_service.parse_pdf(content)
        else:
            parsed_chunks = module_service.parse_markdown(content)
        parse_status = "ok"
    except ValueError as e:
        parse_status = "failed"
        parse_error = str(e)
    mod = LessonModule(
        course_id=course_id, topic_id=topic_id, uploaded_by=current_user.id,
        taught_on=taught_on, original_filename=file.filename or "upload",
        stored_filename=stored_name, file_type=file_type,
        file_size_bytes=len(content), parse_status=parse_status,
        parse_error=parse_error, parsed_chunks=json.dumps(parsed_chunks),
    )
    db.add(mod); await db.flush()
    return ModuleOut(id=str(mod.id), course_id=str(mod.course_id), taught_on=str(mod.taught_on),
                     original_filename=mod.original_filename, parse_status=mod.parse_status, file_type=mod.file_type)

@router.get("/{module_id}", response_model=ModuleOut)
async def get_module(module_id: uuid.UUID, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    mod = await db.get(LessonModule, module_id)
    if not mod:
        raise HTTPException(404, "Module not found.")
    return ModuleOut(id=str(mod.id), course_id=str(mod.course_id), taught_on=str(mod.taught_on),
                     original_filename=mod.original_filename, parse_status=mod.parse_status, file_type=mod.file_type)
