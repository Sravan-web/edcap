# ==============================================================================
# PIPELINE / MODEL COMPONENT: Remedial Queue API Routes (Spaced Repetition)
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.course import Course, SyllabusTopic
from app.models.flag import RemedialQueueItem

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/remedial-queue", tags=["remedial"])


class CompleteRemedialRequest(BaseModel):
    result: str = Field(default="pass", pattern="^(pass|miss)$")


def _next_interval(current_interval: int, result: str, intervals: list[int]) -> int:
    """Compute the next spaced-repetition interval using the configured schedule."""
    if result == "pass":
        # Advance to next interval in the configured SR schedule
        try:
            idx = intervals.index(current_interval)
            return intervals[min(idx + 1, len(intervals) - 1)]
        except ValueError:
            return intervals[0]
    else:
        # Reset on miss
        return intervals[0]


@router.get("")
async def get_remedial_queue(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    course_id: uuid.UUID | None = None,
    due_only: bool = False,
):
    """
    Return the spaced-repetition queue for the current student.
    By default only items due today or earlier are returned.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    query = select(RemedialQueueItem).where(RemedialQueueItem.student_id == current_user.id)

    if course_id:
        query = query.where(RemedialQueueItem.course_id == course_id)
    if due_only:
        query = query.where(RemedialQueueItem.next_review_at <= now)

    query = query.order_by(RemedialQueueItem.next_review_at)
    result = await db.execute(query)
    items = result.scalars().all()

    topic_ids = {i.topic_id for i in items if i.topic_id}
    course_ids = {i.course_id for i in items if i.course_id}
    topics_map: dict[uuid.UUID, SyllabusTopic] = {}
    courses_map: dict[uuid.UUID, Course] = {}
    if topic_ids:
        t_res = await db.execute(select(SyllabusTopic).where(SyllabusTopic.id.in_(topic_ids)))
        topics_map = {t.id: t for t in t_res.scalars().all()}
    if course_ids:
        c_res = await db.execute(select(Course).where(Course.id.in_(course_ids)))
        courses_map = {c.id: c for c in c_res.scalars().all()}

    return [
        {
            "id": str(i.id),
            "topic_id": str(i.topic_id),
            "topic_name": topics_map[i.topic_id].name if i.topic_id in topics_map else "Core Concept Review",
            "course_id": str(i.course_id),
            "course_code": courses_map[i.course_id].code if i.course_id in courses_map else "",
            "next_review_at": i.next_review_at.isoformat(),
            "interval_days": i.interval_days,
            "repetition_count": i.repetition_count,
            "last_result": i.last_result,
            "is_overdue": i.next_review_at < now,
        }
        for i in items
    ]


@router.post("/{item_id}/complete", status_code=200)
async def complete_remedial_item(
    item_id: uuid.UUID,
    current_user: CurrentUser,
    body: CompleteRemedialRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a remedial queue item as completed (pass/miss).
    Updates the interval using spaced-repetition logic and schedules the next review.
    """
    outcome = body.result if body else "pass"
    result = await db.execute(
        select(RemedialQueueItem).where(
            RemedialQueueItem.id == item_id,
            RemedialQueueItem.student_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Remedial queue item not found.")

    intervals = settings.SR_INTERVALS_DAYS
    new_interval = _next_interval(item.interval_days, outcome, intervals)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    item.last_result = outcome
    item.interval_days = new_interval
    item.repetition_count += 1
    item.next_review_at = now + timedelta(days=new_interval)

    await db.flush()
    logger.info(
        "remedial_item_completed",
        item_id=str(item_id),
        student=str(current_user.id),
        result=outcome,
        next_interval=new_interval,
    )

    return {
        "id": str(item.id),
        "topic_id": str(item.topic_id),
        "last_result": item.last_result,
        "interval_days": item.interval_days,
        "repetition_count": item.repetition_count,
        "next_review_at": item.next_review_at.isoformat(),
    }
