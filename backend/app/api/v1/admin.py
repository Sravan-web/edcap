# ==============================================================================
# PIPELINE / MODEL COMPONENT: Admin API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, MFAStepUpRequired, RequireAdmin
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.audit import AuditLog, Setting
from app.models.course import CourseFaculty, Enrollment
from app.models.user import User, UserRole, UserStatus

logger = get_logger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


# ── User Management ───────────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(student|faculty|admin)$")


class UserStatusUpdate(BaseModel):
    status: str = Field(pattern="^(active|suspended|pending)$")


class RoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(student|faculty|admin)$")


@router.get("/users", dependencies=[RequireAdmin])
async def list_users(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    role: str | None = None,
    user_status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all users with optional role/status filters."""
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if user_status:
        query = query.where(User.status == user_status)
    query = query.order_by(User.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": u.role,
            "status": u.status,
            "mfa_enabled": u.mfa_enabled,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.patch("/users/{user_id}/status", dependencies=[RequireAdmin, MFAStepUpRequired])
async def update_user_status(
    user_id: uuid.UUID,
    body: UserStatusUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Suspend or reactivate a user account (requires MFA step-up)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own status.")

    old_status = user.status
    user.status = body.status

    db.add(AuditLog(
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="admin.user_status_change",
        target_type="user",
        target_id=str(user_id),
        outcome="success",
        detail=f'old={old_status} new={body.status}',
    ))
    await db.flush()
    logger.info("user_status_changed", admin=str(current_user.id), user=str(user_id), new_status=body.status)
    return {"id": str(user.id), "status": user.status}


@router.patch("/users/{user_id}/role", dependencies=[RequireAdmin, MFAStepUpRequired])
async def update_user_role(
    user_id: uuid.UUID,
    body: RoleUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Change a user's role (requires MFA step-up)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role.")

    old_role = user.role
    user.role = body.role

    db.add(AuditLog(
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="admin.role_change",
        target_type="user",
        target_id=str(user_id),
        outcome="success",
        detail=f'old={old_role} new={body.role}',
    ))
    await db.flush()
    logger.info("user_role_changed", admin=str(current_user.id), user=str(user_id), new_role=body.role)
    return {"id": str(user.id), "role": user.role}


# ── Course Assignments ────────────────────────────────────────────────────────

class EnrollStudentRequest(BaseModel):
    student_id: uuid.UUID
    course_id: uuid.UUID


class AssignFacultyRequest(BaseModel):
    faculty_id: uuid.UUID
    course_id: uuid.UUID


@router.post("/enrollments", status_code=201, dependencies=[RequireAdmin])
async def enroll_student(
    body: EnrollStudentRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Enroll a student in a course."""
    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == body.student_id,
            Enrollment.course_id == body.course_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Student already enrolled.")

    enrollment = Enrollment(student_id=body.student_id, course_id=body.course_id)
    db.add(enrollment)
    db.add(AuditLog(
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="admin.enroll_student",
        target_type="enrollment",
        target_id=f"{body.student_id}:{body.course_id}",
        outcome="success",
    ))
    await db.flush()
    return {"message": "Student enrolled.", "enrollment_id": str(enrollment.id)}


@router.post("/course-faculty", status_code=201, dependencies=[RequireAdmin])
async def assign_faculty(
    body: AssignFacultyRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Assign a faculty member to a course."""
    existing = await db.execute(
        select(CourseFaculty).where(
            CourseFaculty.faculty_id == body.faculty_id,
            CourseFaculty.course_id == body.course_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Faculty already assigned.")

    link = CourseFaculty(faculty_id=body.faculty_id, course_id=body.course_id)
    db.add(link)
    db.add(AuditLog(
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="admin.assign_faculty",
        target_type="course_faculty",
        target_id=f"{body.faculty_id}:{body.course_id}",
        outcome="success",
    ))
    await db.flush()
    return {"message": "Faculty assigned.", "link_id": str(link.id)}


# ── Audit Logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs", dependencies=[RequireAdmin])
async def get_audit_logs(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Return paginated audit logs. Admin only."""
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if actor_id:
        query = query.where(AuditLog.actor_id == actor_id)
    query = query.order_by(desc(AuditLog.timestamp)).limit(limit).offset(offset)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_email": log.actor_email,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "target": f"{log.target_type}:{log.target_id}" if log.target_type and log.target_id else (log.target_type or log.target_id or "—"),
            "outcome": log.outcome,
            "ip_prefix": log.ip_prefix or "127.0.0.0/24",
            "timestamp": log.timestamp.isoformat(),
            "detail": log.detail,
        }
        for log in logs
    ]


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingUpdate(BaseModel):
    value: str = Field(max_length=2000)


@router.get("/settings", dependencies=[RequireAdmin])
async def get_settings_list(db: AsyncSession = Depends(get_db)):
    """List all application settings."""
    result = await db.execute(select(Setting).order_by(Setting.key))
    settings_rows = result.scalars().all()
    return [{"key": s.key, "value": s.value, "updated_by": str(s.updated_by) if s.updated_by else None} for s in settings_rows]


@router.put("/settings/{key}", dependencies=[RequireAdmin])
@router.patch("/settings/{key}", dependencies=[RequireAdmin])
async def upsert_setting(
    key: str,
    body: SettingUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a settings key-value pair."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = body.value
        setting.updated_by = current_user.id
    else:
        setting = Setting(key=key, value=body.value, updated_by=current_user.id)
        db.add(setting)
    await db.flush()
    return {"key": setting.key, "value": setting.value}
