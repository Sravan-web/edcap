# ==============================================================================
# PIPELINE / MODEL COMPONENT: Rule Engine — Support Flag Detection
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
"""
Rule engine that runs on per-student per-course assessment data and
raises SupportFlag records when threshold rules fire.

Three rule categories:
  Rule 1 — Below-average (configurable window + min-fires)
  Rule 2 — Negative trend slope
  Rule 3 — Topic-specific accuracy below threshold
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.assessment import Assessment, AssessmentScore
from app.models.course import Enrollment
from app.models.flag import SupportFlag
from app.models.user import UserRole

settings = get_settings()
logger = get_logger(__name__)


@dataclass
class RuleResult:
    fired: bool
    track: str
    risk_score: float
    reasons: list[str] = field(default_factory=list)
    top_features: list[dict[str, Any]] = field(default_factory=list)


def _linear_slope(values: list[float]) -> float:
    """Compute slope of values using simple linear regression."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    return numerator / denominator if denominator else 0.0


async def evaluate_student(
    db: AsyncSession,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
) -> list[RuleResult]:
    """
    Evaluate all rules for a given student+course.
    Returns a list of fired RuleResults (may be empty if no rules triggered).
    """
    # Fetch assessment scores for this student in this course
    result = await db.execute(
        select(AssessmentScore, Assessment)
        .join(Assessment, AssessmentScore.assessment_id == Assessment.id)
        .where(
            AssessmentScore.student_id == student_id,
            Assessment.course_id == course_id,
        )
        .order_by(Assessment.assessment_date)
    )
    rows = result.all()

    if not rows:
        return []

    pct_scores = [
        (s.score / s.max_score * 100) if s.max_score else 0.0
        for s, _ in rows
    ]

    # Compute class average for below-average calculation
    class_avgs = await _get_class_averages(db, course_id)
    fired: list[RuleResult] = []

    # Rule 1: Below-class-average in a sliding window
    rule1 = _rule_below_average(pct_scores, class_avgs)
    if rule1.fired:
        fired.append(rule1)

    # Rule 2: Negative trend slope
    rule2 = _rule_negative_trend(pct_scores)
    if rule2.fired:
        fired.append(rule2)

    # Rule 3: Topic accuracy
    topic_scores: dict[str, list[float]] = {}
    for score, assessment in rows:
        tag = assessment.topic_tag or "unknown"
        pct = (score.score / score.max_score * 100) if score.max_score else 0.0
        topic_scores.setdefault(tag, []).append(pct)

    rule3 = _rule_topic_accuracy(topic_scores)
    if rule3.fired:
        fired.append(rule3)

    return fired


async def _get_class_averages(db: AsyncSession, course_id: uuid.UUID) -> list[float]:
    """Get per-assessment class average scores as percentages."""
    from sqlalchemy import func
    result = await db.execute(
        select(
            Assessment.id,
            func.avg(AssessmentScore.score / AssessmentScore.max_score * 100),
        )
        .join(AssessmentScore, AssessmentScore.assessment_id == Assessment.id)
        .where(Assessment.course_id == course_id, AssessmentScore.max_score > 0)
        .group_by(Assessment.id)
        .order_by(Assessment.assessment_date)
    )
    rows = result.all()
    return [float(row[1] or 0) for row in rows]


def _rule_below_average(
    student_pcts: list[float],
    class_avgs: list[float],
) -> RuleResult:
    window = settings.RULE_BELOW_AVG_WINDOW
    min_fires = settings.RULE_BELOW_AVG_MIN_FIRES
    threshold_pct = settings.RULE_BELOW_AVG_PCT

    recent_student = student_pcts[-window:] if len(student_pcts) >= window else student_pcts
    recent_class = class_avgs[-window:] if len(class_avgs) >= window else class_avgs

    fires = 0
    reasons = []
    for s, c in zip(recent_student, recent_class):
        if c > 0 and (c - s) > threshold_pct:
            fires += 1
            reasons.append(f"Score {s:.1f}% was {c - s:.1f}% below class avg {c:.1f}%")

    if fires >= min_fires:
        risk = min(1.0, fires / window)
        return RuleResult(
            fired=True,
            track="A_foundational",
            risk_score=risk,
            reasons=reasons,
            top_features=[{"feature": "below_avg_fires", "value": fires}],
        )
    return RuleResult(fired=False, track="normal", risk_score=0.0)


def _rule_negative_trend(pct_scores: list[float]) -> RuleResult:
    min_assessments = settings.RULE_TREND_MIN_ASSESSMENTS
    slope_threshold = settings.RULE_TREND_SLOPE

    if len(pct_scores) < min_assessments:
        return RuleResult(fired=False, track="normal", risk_score=0.0)

    slope = _linear_slope(pct_scores)
    if slope < slope_threshold:
        risk = min(1.0, abs(slope) / 10.0)
        return RuleResult(
            fired=True,
            track="A_foundational",
            risk_score=risk,
            reasons=[f"Test scores are trending downward (dropping ~{abs(slope):.1f}% per test)"],
            top_features=[{"feature": "trend_slope", "value": round(slope, 3)}],
        )
    return RuleResult(fired=False, track="normal", risk_score=0.0)


def _rule_topic_accuracy(topic_scores: dict[str, list[float]]) -> RuleResult:
    accuracy_threshold = settings.RULE_TOPIC_ACCURACY_PCT
    min_attempts = settings.RULE_TOPIC_MIN_ATTEMPTS

    weak_topics = []
    for tag, scores in topic_scores.items():
        if len(scores) >= min_attempts:
            avg = sum(scores) / len(scores)
            if avg < accuracy_threshold:
                weak_topics.append({"tag": tag, "avg": round(avg, 1)})

    if weak_topics:
        risk = min(1.0, len(weak_topics) / 5.0)
        reasons = [f"Low accuracy ({t['avg']}%) on topic '{t['tag']}'" for t in weak_topics]
        return RuleResult(
            fired=True,
            track="A_foundational",
            risk_score=risk,
            reasons=reasons,
            top_features=[{"feature": "weak_topic", "value": t["tag"]} for t in weak_topics],
        )
    return RuleResult(fired=False, track="normal", risk_score=0.0)


async def run_rule_engine_for_course(
    db: AsyncSession,
    course_id: uuid.UUID,
) -> int:
    """
    Run the rule engine for all enrolled students in a course.
    Creates new SupportFlag records where rules fire (avoids duplicating open flags).
    Returns the number of new flags created.
    """
    import json

    # Get enrolled students
    enrollment_result = await db.execute(
        select(Enrollment.student_id).where(Enrollment.course_id == course_id)
    )
    student_ids = [row[0] for row in enrollment_result.all()]

    created = 0
    for student_id in student_ids:
        fired_rules = await evaluate_student(db, student_id=student_id, course_id=course_id)

        # Check if there's already an open flag for this student+course
        existing = await db.execute(
            select(SupportFlag).where(
                SupportFlag.student_id == student_id,
                SupportFlag.course_id == course_id,
                SupportFlag.status == "open",
            )
        )
        if existing.scalar_one_or_none():
            continue  # Don't pile on flags for already-open cases

        # Merge all fired rules into one flag (highest risk track wins)
        if not fired_rules:
            continue

        best = max(fired_rules, key=lambda r: r.risk_score)
        all_reasons: list[str] = []
        all_features: list[dict] = []
        for r in fired_rules:
            all_reasons.extend(r.reasons)
            all_features.extend(r.top_features)

        flag = SupportFlag(
            student_id=student_id,
            course_id=course_id,
            track=best.track,
            risk_score=round(best.risk_score, 4),
            reasons=json.dumps(all_reasons),
            top_features=json.dumps(all_features),
            status="open",
        )
        db.add(flag)
        created += 1

    if created:
        await db.flush()
        logger.info("rule_engine_ran", course_id=str(course_id), flags_created=created)

    return created
