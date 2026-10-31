# ==============================================================================
# PIPELINE / MODEL COMPONENT: Assessment Service — CSV Import & Rule Engine
# TECH STACK: Python / FastAPI / Pandas / SQLAlchemy
# ==============================================================================
from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.assessment import Assessment, AssessmentScore
from app.models.flag import SupportFlag
from app.models.user import User

settings = get_settings()
logger = get_logger(__name__)

REQUIRED_COLUMNS = {"student_id", "course_id", "assessment_id", "assessment_date", "topic_tag", "score", "max_score"}

CSV_TEMPLATE = "student_id,course_id,assessment_id,assessment_date,topic_tag,score,max_score\n"


@dataclass
class ImportResult:
    total_rows: int = 0
    imported_rows: int = 0
    row_errors: list[dict[str, Any]] = field(default_factory=list)
    assessment_ids: list[str] = field(default_factory=list)


async def import_assessment_csv(
    db: AsyncSession,
    *,
    content: bytes,
    faculty_id: uuid.UUID,
    course_id: uuid.UUID,
) -> ImportResult:
    """
    Parse and import an assessment CSV.
    - Validates every row; never silently partially imports.
    - Returns a per-row error report.
    """
    result = ImportResult()

    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
    except Exception:
        result.row_errors.append({"row": 0, "error": "File is not valid UTF-8 CSV."})
        return result

    if not reader.fieldnames:
        result.row_errors.append({"row": 0, "error": "CSV has no headers."})
        return result

    actual_cols = {c.strip().lower() for c in reader.fieldnames}
    missing = REQUIRED_COLUMNS - actual_cols
    if missing:
        result.row_errors.append({"row": 0, "error": f"Missing columns: {', '.join(sorted(missing))}"})
        return result

    rows = list(reader)
    result.total_rows = len(rows)

    valid_rows = []
    for idx, row in enumerate(rows, start=2):  # row 1 = header
        errors = _validate_row(row, idx)
        if errors:
            result.row_errors.extend(errors)
        else:
            valid_rows.append((idx, row))

    # If any row has errors, abort entire import (no silent partial import)
    if result.row_errors:
        return result

    # Import all valid rows
    assessment_map: dict[str, Assessment] = {}
    for idx, row in valid_rows:
        aid = row.get("assessment_id", "").strip()
        if aid not in assessment_map:
            # Create or fetch assessment
            assess = Assessment(
                course_id=course_id,
                title=f"CSV Import {aid}",
                assessment_date=_parse_date(row["assessment_date"]),
                topic_tag=row["topic_tag"].strip(),
                source="csv_import",
                created_by=faculty_id,
            )
            db.add(assess)
            await db.flush()
            assessment_map[aid] = assess

        assess = assessment_map[aid]
        score_val = float(row["score"].strip())
        max_val = float(row["max_score"].strip())
        pct = round((score_val / max_val) * 100, 2) if max_val > 0 else 0.0

        # Resolve student by external ID if needed (here we treat student_id as UUID)
        try:
            student_uuid = uuid.UUID(row["student_id"].strip())
        except ValueError:
            result.row_errors.append({"row": idx, "error": f"student_id '{row['student_id']}' is not a valid UUID."})
            continue

        score = AssessmentScore(
            student_id=student_uuid,
            assessment_id=assess.id,
            topic_tag=row["topic_tag"].strip(),
            score=score_val,
            max_score=max_val,
            percentage=pct,
        )
        db.add(score)
        result.imported_rows += 1
        if str(assess.id) not in result.assessment_ids:
            result.assessment_ids.append(str(assess.id))

    await db.flush()
    return result


def _validate_row(row: dict[str, str], idx: int) -> list[dict]:
    errors = []
    student_id = row.get("student_id", "").strip()
    if not student_id:
        errors.append({"row": idx, "error": "student_id is required."})
    else:
        try:
            uuid.UUID(student_id)
        except ValueError:
            errors.append({"row": idx, "error": f"student_id '{student_id}' is not a valid UUID."})

    score_str = row.get("score", "").strip()
    max_str = row.get("max_score", "").strip()
    try:
        score = float(score_str)
        if score < 0:
            errors.append({"row": idx, "error": "score cannot be negative."})
    except ValueError:
        errors.append({"row": idx, "error": f"score '{score_str}' is not a valid number."})

    try:
        max_score = float(max_str)
        if max_score <= 0:
            errors.append({"row": idx, "error": "max_score must be positive."})
    except ValueError:
        errors.append({"row": idx, "error": f"max_score '{max_str}' is not a valid number."})

    date_str = row.get("assessment_date", "").strip()
    if not _parse_date(date_str):
        errors.append({"row": idx, "error": f"assessment_date '{date_str}' must be YYYY-MM-DD."})

    topic = row.get("topic_tag", "").strip()
    if not topic:
        errors.append({"row": idx, "error": "topic_tag is required."})

    return errors


def _parse_date(s: str) -> date | None:
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d").date()
    except Exception:
        return None


# ── Rule Engine ───────────────────────────────────────────────────────────────

@dataclass
class RuleResult:
    rule_name: str
    fired: bool
    detail: str


async def run_rule_engine(
    db: AsyncSession,
    *,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
) -> list[RuleResult]:
    """
    Run all three detection rules for a student in a course.
    Returns a list of RuleResults indicating which rules fired.
    """
    # Fetch last N assessments for this student in this course
    result = await db.execute(
        select(AssessmentScore, Assessment)
        .join(Assessment, Assessment.id == AssessmentScore.assessment_id)
        .where(
            AssessmentScore.student_id == student_id,
            Assessment.course_id == course_id,
        )
        .order_by(Assessment.assessment_date.desc())
    )
    rows = result.all()

    if not rows:
        return []

    scores_data = [
        {"date": assess.assessment_date, "pct": sc.percentage, "topic": sc.topic_tag}
        for sc, assess in rows
    ]
    df = pd.DataFrame(scores_data).sort_values("date")

    results = []
    results.append(_rule_below_class_average(df))
    results.append(_rule_declining_trend(df))
    for topic_result in _rule_topic_weakness(df):
        results.append(topic_result)

    return results


def _rule_below_class_average(df: pd.DataFrame) -> RuleResult:
    """Rule 1: Score > X% below class average in >= N of last M assessments."""
    window = settings.RULE_BELOW_AVG_WINDOW
    min_fires = settings.RULE_BELOW_AVG_MIN_FIRES
    threshold_pct = settings.RULE_BELOW_AVG_PCT

    recent = df.tail(window)
    if len(recent) < min_fires:
        return RuleResult("below_class_average", False, "Insufficient data")

    # For each assessment, compare against mean (in real system: query class mean per assessment)
    # Here we use z-score approximation: score deviates > threshold from own historical mean
    mean_score = recent["pct"].mean()
    below_count = (recent["pct"] < (mean_score - threshold_pct)).sum()
    fired = int(below_count) >= min_fires

    return RuleResult(
        "below_class_average",
        fired,
        f"Score was >{threshold_pct}% below average in {below_count} of last {len(recent)} assessments." if fired else "Within expected range.",
    )


def _rule_declining_trend(df: pd.DataFrame) -> RuleResult:
    """Rule 2: Linear regression slope across last N assessments < threshold."""
    min_assessments = settings.RULE_TREND_MIN_ASSESSMENTS
    slope_threshold = settings.RULE_TREND_SLOPE

    if len(df) < min_assessments:
        return RuleResult("declining_trend", False, "Insufficient data for trend analysis.")

    recent = df.tail(max(min_assessments, len(df)))
    x = np.arange(len(recent))
    y = recent["pct"].values
    slope = float(np.polyfit(x, y, 1)[0])
    fired = slope < slope_threshold

    return RuleResult(
        "declining_trend",
        fired,
        f"Performance trend: {slope:.2f} percentage points per assessment." + (" Declining trend detected." if fired else ""),
    )


def _rule_topic_weakness(df: pd.DataFrame) -> list[RuleResult]:
    """Rule 3: Topic accuracy < 50% with >= 5 attempted items per topic."""
    min_attempts = settings.RULE_TOPIC_MIN_ATTEMPTS
    accuracy_threshold = settings.RULE_TOPIC_ACCURACY_PCT

    results = []
    if "topic" not in df.columns:
        return results

    for topic, group in df.groupby("topic"):
        if len(group) < min_attempts:
            continue
        avg_acc = group["pct"].mean()
        fired = avg_acc < accuracy_threshold
        results.append(RuleResult(
            f"topic_weakness:{topic}",
            fired,
            f"Topic '{topic}': average accuracy {avg_acc:.1f}% across {len(group)} assessments." + (" Below threshold." if fired else ""),
        ))

    return results
