# ==============================================================================
# PIPELINE / MODEL COMPONENT: Playbooks API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, RequireFaculty
from app.api.v1.flags import _parse_reasons
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.course import CourseFaculty
from app.models.flag import Playbook, SupportFlag
from app.models.user import UserRole

logger = get_logger(__name__)
router = APIRouter(prefix="/playbooks", tags=["playbooks"])


class PlaybookCreate(BaseModel):
    flag_id: uuid.UUID
    content: dict | None = None  # free-form JSON per §11.1; auto-generated if omitted
    strategy_ids_used: list[str] = []


def _default_playbook_content(flag: SupportFlag) -> tuple[dict, list[str]]:
    """Generate structured pedagogical intervention content for a support flag."""
    track = flag.track or "A_foundational"
    reasons = _parse_reasons(flag.reasons) or ["Identified learning support signal"]
    templates = {
        "A_foundational": (
            {
                "summary": "Foundational Concept Reinforcement & Worked-Example Scaffolding",
                "diagnostic_signals": reasons,
                "pedagogical_strategies": [
                    "Worked-Example Fading: Walk through 2 complete problems before assigning independent practice.",
                    "Prerequisite Micro-Bridging: Review core prerequisite definitions for 10 minutes prior to lecture.",
                    "Spaced Retrieval Practice: Schedule 1-3-7 day remedial review checkpoints on foundational topics.",
                ],
                "faculty_action_steps": [
                    "Share annotated step-by-step solutions for the most recently missed assessment topic.",
                    "Assign the targeted foundational remedial module in EdCap AI.",
                    "Check in during office hours with a low-stakes diagnostic warm-up.",
                ],
                "expected_outcome": "Improve foundational topic accuracy above 65% within 2 assessment cycles.",
            },
            ["STRAT-FOUND-01", "STRAT-FOUND-04", "STRAT-SR-02"],
        ),
        "B_language": (
            {
                "summary": "Academic Language & Terminology Comprehension Support",
                "diagnostic_signals": reasons,
                "pedagogical_strategies": [
                    "Dual-Coding & Visual Glossaries: Pair technical terms with diagrams and concrete examples.",
                    "Stem Deconstruction: Practice breaking multi-clause word problems into explicit given/find steps.",
                    "Bilingual Concept Mapping: Encourage mapping domain vocabulary to intuitive mental models.",
                ],
                "faculty_action_steps": [
                    "Provide a 1-page terminology sheet ahead of complex problem sets.",
                    "Highlight key command verbs in practice quiz stems.",
                    "Review word-problem translation strategies in small-group discussion.",
                ],
                "expected_outcome": "Reduce comprehension errors on text-heavy conceptual questions by 30%.",
            },
            ["STRAT-LANG-01", "STRAT-LANG-03"],
        ),
        "C_engagement": (
            {
                "summary": "Re-Engagement & Self-Regulated Learning Momentum Plan",
                "diagnostic_signals": reasons,
                "pedagogical_strategies": [
                    "Micro-Goal Streak Recovery: Break daily study into 5-minute low-friction quiz habits.",
                    "Supportive Check-In: Conduct a brief, non-punitive 1-on-1 check-in to identify blockers.",
                    "Peer Study Pairing: Connect student with an active study group for accountability.",
                ],
                "faculty_action_steps": [
                    "Send a supportive check-in message acknowledging recent workload challenges.",
                    "Reset daily quiz habit target to 3 consecutive completions this week.",
                    "Monitor remedial queue completion over the next 7 days.",
                ],
                "expected_outcome": "Restore consistent daily quiz participation and active learning streak.",
            },
            ["STRAT-ENG-01", "STRAT-ENG-02"],
        ),
    }
    return templates.get(track, templates["A_foundational"])


@router.get("")
async def list_playbooks(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    flag_id: uuid.UUID | None = None,
):
    """List playbooks visible to the requester."""
    query = select(Playbook)

    if flag_id:
        query = query.where(Playbook.flag_id == flag_id)

    if current_user.role == UserRole.FACULTY.value:
        # Restrict to courses where faculty is assigned
        cf_result = await db.execute(
            select(CourseFaculty.course_id).where(CourseFaculty.faculty_id == current_user.id)
        )
        course_ids = [r[0] for r in cf_result.all()]
        query = query.where(Playbook.course_id.in_(course_ids))

    query = query.order_by(Playbook.created_at.desc())
    result = await db.execute(query)
    playbooks = result.scalars().all()

    return [
        {
            "id": str(p.id),
            "flag_id": str(p.flag_id),
            "course_id": str(p.course_id),
            "content": json.loads(p.content) if isinstance(p.content, str) else p.content,
            "strategy_ids_used": json.loads(p.strategy_ids_used) if isinstance(p.strategy_ids_used, str) else p.strategy_ids_used,
            "approved_by": str(p.approved_by) if p.approved_by else None,
            "created_at": p.created_at.isoformat(),
        }
        for p in playbooks
    ]


@router.post("", status_code=201, dependencies=[RequireFaculty])
async def create_playbook(
    body: PlaybookCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a playbook linked to a support flag."""
    flag_result = await db.execute(select(SupportFlag).where(SupportFlag.id == body.flag_id))
    flag = flag_result.scalar_one_or_none()
    if not flag:
        raise HTTPException(status_code=404, detail="Support flag not found.")

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

    content_dict = body.content
    strategy_ids = body.strategy_ids_used
    if not content_dict:
        content_dict, default_strats = _default_playbook_content(flag)
        if not strategy_ids:
            strategy_ids = default_strats

    playbook = Playbook(
        flag_id=body.flag_id,
        course_id=flag.course_id,
        content=json.dumps(content_dict),
        strategy_ids_used=json.dumps(strategy_ids),
        approved_by=current_user.id,
    )
    db.add(playbook)
    await db.flush()
    logger.info("playbook_created", playbook_id=str(playbook.id), flag_id=str(body.flag_id))

    return {
        "id": str(playbook.id),
        "flag_id": str(playbook.flag_id),
        "course_id": str(playbook.course_id),
        "content": content_dict,
        "strategy_ids_used": strategy_ids,
        "approved_by": str(playbook.approved_by),
        "created_at": playbook.created_at.isoformat(),
    }


@router.get("/{playbook_id}")
async def get_playbook(
    playbook_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single playbook by ID."""
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Playbook not found.")

    return {
        "id": str(p.id),
        "flag_id": str(p.flag_id),
        "course_id": str(p.course_id),
        "content": json.loads(p.content) if isinstance(p.content, str) else p.content,
        "strategy_ids_used": json.loads(p.strategy_ids_used) if isinstance(p.strategy_ids_used, str) else p.strategy_ids_used,
        "approved_by": str(p.approved_by) if p.approved_by else None,
        "created_at": p.created_at.isoformat(),
    }
