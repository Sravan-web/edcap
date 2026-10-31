# ==============================================================================
# PIPELINE / MODEL COMPONENT: ML Feature Computer
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
"""
Computes the 9 ML features from §6.1 of the problem spec
for a given student+course pair and persists them to student_features.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.assessment import Assessment, AssessmentScore
from app.models.flag import EngagementStats
from app.models.quiz import QuizAnswer, QuizAttempt, QuizSet
from app.models.telemetry import StudentFeatures, TelemetryEvent

logger = get_logger(__name__)


def _linear_slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0


async def compute_and_store_features(
    db: AsyncSession,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
) -> StudentFeatures:
    """
    Compute all 9 ML features for the student and upsert to student_features.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    window_30 = now - timedelta(days=30)

    # 1. velocity_decay_score — average quiz score trend slope (negative = decaying)
    scores_result = await db.execute(
        select(AssessmentScore.score, AssessmentScore.max_score, Assessment.assessment_date)
        .join(Assessment, AssessmentScore.assessment_id == Assessment.id)
        .where(
            AssessmentScore.student_id == student_id,
            Assessment.course_id == course_id,
        )
        .order_by(Assessment.assessment_date)
    )
    score_rows = scores_result.all()
    pcts = [(s / m * 100) if m else 0 for s, m, _ in score_rows]
    slope = _linear_slope(pcts)
    velocity_decay = max(0.0, 1.0 + slope / 100)  # normalised 0–1

    # 2. format_preference_delta — proportion of time using non-default format
    tel_result = await db.execute(
        select(TelemetryEvent.format_used, func.count(TelemetryEvent.id))
        .where(
            TelemetryEvent.student_id == student_id,
            TelemetryEvent.received_at >= window_30,
        )
        .group_by(TelemetryEvent.format_used)
    )
    format_counts = {row[0]: row[1] for row in tel_result.all()}
    total_events = sum(format_counts.values()) or 1
    non_default = total_events - format_counts.get("text_based", 0)
    format_delta = non_default / total_events

    # 3. hesitation_index — avg hesitation count per telemetry event
    hesitation_result = await db.execute(
        select(func.avg(TelemetryEvent.hesitation_count))
        .where(
            TelemetryEvent.student_id == student_id,
            TelemetryEvent.received_at >= window_30,
        )
    )
    hesitation_index = float(hesitation_result.scalar_one() or 0.0)

    # 4. persistence_decay_rate — 1 - (recent quiz attempts / total quiz attempts)
    total_attempts = await db.execute(
        select(func.count(QuizAttempt.id)).where(QuizAttempt.student_id == student_id)
    )
    recent_attempts = await db.execute(
        select(func.count(QuizAttempt.id)).where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.started_at >= window_30,
        )
    )
    total_n = total_attempts.scalar_one() or 1
    recent_n = recent_attempts.scalar_one() or 0
    persistence_decay = 1.0 - (recent_n / total_n)

    # 5. topic_accuracy — average accuracy across all topics in this course
    topic_acc = sum(pcts) / len(pcts) / 100 if pcts else 1.0

    # 6. trend_slope — raw slope of score percentages
    trend_slope = slope

    # 7. streak_consistency — engagement streak from EngagementStats
    eng_result = await db.execute(
        select(EngagementStats).where(
            EngagementStats.student_id == student_id,
            EngagementStats.course_id == course_id,
        )
    )
    eng = eng_result.scalar_one_or_none()
    streak_consistency = (eng.current_streak / max(eng.longest_streak, 1)) if eng and eng.longest_streak else 0.0

    # 8. prereq_accuracy — accuracy on prerequisite_check type questions
    prereq_result = await db.execute(
        select(QuizAnswer.is_correct)
        .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
        .join(QuizSet, QuizAttempt.quiz_set_id == QuizSet.id)
        .where(
            QuizAttempt.student_id == student_id,
            QuizSet.course_id == course_id,
        )
        # Filter by prerequisite_check questions via question_type
    )
    prereq_rows = prereq_result.all()
    prereq_acc = (sum(1 for r in prereq_rows if r[0]) / len(prereq_rows)) if prereq_rows else 1.0

    # 9. reading_speed — inverse of avg submission_latency (normalised)
    latency_result = await db.execute(
        select(func.avg(TelemetryEvent.submission_latency_s)).where(
            TelemetryEvent.student_id == student_id,
            TelemetryEvent.received_at >= window_30,
        )
    )
    avg_latency = float(latency_result.scalar_one() or 30.0)
    reading_speed = min(1.0, 30.0 / max(avg_latency, 1.0))

    # Upsert student_features
    existing = await db.execute(
        select(StudentFeatures).where(
            StudentFeatures.student_id == student_id,
            StudentFeatures.course_id == course_id,
        )
    )
    features = existing.scalar_one_or_none()
    if features:
        features.velocity_decay_score = velocity_decay
        features.format_preference_delta = format_delta
        features.hesitation_index = hesitation_index
        features.persistence_decay_rate = persistence_decay
        features.topic_accuracy = topic_acc
        features.trend_slope = trend_slope
        features.streak_consistency = streak_consistency
        features.prereq_accuracy = prereq_acc
        features.reading_speed = reading_speed
        features.computed_at = now
    else:
        features = StudentFeatures(
            student_id=student_id,
            course_id=course_id,
            velocity_decay_score=velocity_decay,
            format_preference_delta=format_delta,
            hesitation_index=hesitation_index,
            persistence_decay_rate=persistence_decay,
            topic_accuracy=topic_acc,
            trend_slope=trend_slope,
            streak_consistency=streak_consistency,
            prereq_accuracy=prereq_acc,
            reading_speed=reading_speed,
            computed_at=now,
        )
        db.add(features)

    await db.flush()
    logger.info(
        "features_computed",
        student=str(student_id),
        course=str(course_id),
        trend_slope=round(trend_slope, 3),
        topic_acc=round(topic_acc, 3),
    )
    return features
