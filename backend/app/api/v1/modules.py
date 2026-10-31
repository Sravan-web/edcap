from __future__ import annotations
import json, uuid
from datetime import date
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser, RequireFaculty
from app.core.config import get_settings
from app.core.database import get_db
from app.models.module import LessonModule
from app.services import module_service

settings = get_settings()
router = APIRouter(prefix="/modules", tags=["modules"])

class ModuleOut(BaseModel):
    id: str; course_id: str; taught_on: str; original_filename: str; parse_status: str; file_type: str

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
