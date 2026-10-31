# ==============================================================================
# PIPELINE / MODEL COMPONENT: Support Flags API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireFaculty
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.audit import AuditLog
from app.models.course import CourseFaculty
from app.models.flag import SupportFlag
from app.models.user import UserRole

logger = get_logger(__name__)
router = APIRouter(prefix="/flags", tags=["flags"])


class FlagUpdateRequest(BaseModel):
    status: str | None = Field(None, pattern="^(acknowledged|dismissed|resolved|overridden)$")
    override_track: str | None = Field(None, max_length=30)
    override_note: str | None = Field(None, max_length=1000)


def _parse_reasons(raw: str | list | None) -> list[str]:
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except Exception:
            if raw.strip():
                return [raw.strip()]
    return []


def _parse_top_features(raw: str | dict | list | None) -> dict[str, float]:
    parsed = raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
    if isinstance(parsed, dict):
        out: dict[str, float] = {}
        for k, v in parsed.items():
            try:
                out[str(k)] = float(v)
            except (TypeError, ValueError):
                pass
        return out
    if isinstance(parsed, list):
        out = {}
        for item in parsed:
            if isinstance(item, dict) and "feature" in item:
                try:
                    out[str(item["feature"])] = float(item.get("value", item.get("shap_value", 0.0)))
                except (TypeError, ValueError):
                    pass
        return out
    return {}


@router.get("")
async def list_flags(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    course_id: uuid.UUID | None = None,
    flag_status: str | None = None,
    status: str | None = None,
    track: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List support flags. Faculty see flags in their courses.
    Admins see all. Students see only their own.
    """
    query = select(SupportFlag)

    if current_user.role == UserRole.STUDENT.value:
        query = query.where(SupportFlag.student_id == current_user.id)
    elif current_user.role == UserRole.FACULTY.value:
        # Get courses assigned to this faculty
        cf_result = await db.execute(
            select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id)
        )
        faculty_course_ids = [row[0] for row in cf_result.all()]
        query = query.where(SupportFlag.course_id.in_(faculty_course_ids))
    # Admin sees all

    effective_status = flag_status or status
    if course_id:
        query = query.where(SupportFlag.course_id == course_id)
    if effective_status:
        query = query.where(SupportFlag.status == effective_status)
    if track:
        query = query.where(SupportFlag.track == track)

    query = query.order_by(SupportFlag.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    flags = result.scalars().all()

    return [
        {
            "id": str(f.id),
            "student_id": str(f.student_id),
            "course_id": str(f.course_id),
            "topic_id": str(f.topic_id) if f.topic_id else None,
            "track": f.track,
            "risk_score": f.risk_score,
            "reasons": _parse_reasons(f.reasons),
            "top_features": _parse_top_features(f.top_features),
            "status": f.status,
            "reviewed_by": str(f.reviewed_by) if f.reviewed_by else None,
            "reviewed_at": f.reviewed_at.isoformat() if f.reviewed_at else None,
            "override_track": f.override_track,
            "override_note": f.override_note,
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat(),
        }
        for f in flags
    ]


@router.patch("/{flag_id}", dependencies=[RequireFaculty])
async def update_flag(
    flag_id: uuid.UUID,
    body: FlagUpdateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Faculty or admin updates a support flag status/override."""
    result = await db.execute(select(SupportFlag).where(SupportFlag.id == flag_id))
    flag = result.scalar_one_or_none()
    if not flag:
        raise HTTPException(status_code=404, detail="Flag not found.")

    # Faculty must own the course
    if current_user.role == UserRole.FACULTY.value:
        cf = await db.execute(
            select(CourseFaculty).where(
                CourseFaculty.faculty_id == current_user.id,
                CourseFaculty.course_id == flag.course_id,
            )
        )
        if not cf.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not assigned to this course.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    old_status = flag.status

    if body.status:
        flag.status = body.status
        flag.reviewed_by = current_user.id
        flag.reviewed_at = now
    if body.override_track is not None:
        flag.override_track = body.override_track
    if body.override_note is not None:
        flag.override_note = body.override_note

    # Audit
    db.add(
        AuditLog(
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="flag.update",
            target_type="support_flag",
            target_id=str(flag_id),
            outcome="success",
            detail=f'old={old_status} new={flag.status}',
        )
    )
    await db.flush()
    logger.info("flag_updated", flag_id=str(flag_id), actor=str(current_user.id), new_status=flag.status)

    return {
        "id": str(flag.id),
        "status": flag.status,
        "override_track": flag.override_track,
        "override_note": flag.override_note,
        "reviewed_by": str(flag.reviewed_by) if flag.reviewed_by else None,
        "reviewed_at": flag.reviewed_at.isoformat() if flag.reviewed_at else None,
    }


@router.post("/send-digest", dependencies=[RequireFaculty])
async def trigger_support_digest(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    course_id: uuid.UUID | None = None,
):
    """
    Manually or programmatically trigger delivery of learning support digest emails
    for open flags to assigned faculty members.
    """
    from app.services.notification_service import dispatch_support_signal_digests

    result = await dispatch_support_signal_digests(db, course_id=course_id)
    return {
        "message": "Learning support digest emails processed.",
        **result,
    }
