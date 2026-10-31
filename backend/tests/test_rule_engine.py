# ==============================================================================
# PIPELINE / MODEL COMPONENT: Tests — Rule Engine Unit Tests
# TECH STACK: Python / pytest
# ==============================================================================
"""
Unit tests for the rule engine.
These tests are pure Python and do not require a database.
"""
from __future__ import annotations

import pytest

from app.services.rule_engine import (
    _linear_slope,
    _rule_below_average,
    _rule_negative_trend,
    _rule_topic_accuracy,
)


# ── Linear Slope ──────────────────────────────────────────────────────────────

def test_linear_slope_flat():
    assert abs(_linear_slope([50.0, 50.0, 50.0, 50.0])) < 0.01


def test_linear_slope_positive():
    slope = _linear_slope([60.0, 65.0, 70.0, 75.0])
    assert slope > 0


def test_linear_slope_negative():
    slope = _linear_slope([80.0, 72.0, 64.0, 56.0])
    assert slope < 0


def test_linear_slope_single_value():
    assert _linear_slope([70.0]) == 0.0


def test_linear_slope_empty():
    assert _linear_slope([]) == 0.0


# ── Rule 1: Below Average ─────────────────────────────────────────────────────

def test_rule_below_average_fires():
    """Student consistently 20% below class average in last 5 assessments."""
    student = [40.0, 42.0, 38.0, 41.0, 39.0]
    class_avgs = [60.0, 62.0, 60.0, 63.0, 61.0]
    result = _rule_below_average(student, class_avgs)
    assert result.fired is True
    assert result.track == "A_foundational"
    assert result.risk_score > 0


def test_rule_below_average_not_fired():
    """Student slightly below average — doesn't cross threshold."""
    student = [55.0, 58.0, 57.0, 56.0, 59.0]
    class_avgs = [60.0, 60.0, 60.0, 60.0, 60.0]
    result = _rule_below_average(student, class_avgs)
    assert result.fired is False


def test_rule_below_average_no_class_data():
    result = _rule_below_average([40.0, 40.0], [])
    assert result.fired is False


# ── Rule 2: Negative Trend ────────────────────────────────────────────────────

def test_rule_negative_trend_fires():
    """Steep declining scores over 4+ assessments."""
    scores = [80.0, 72.0, 62.0, 50.0, 40.0]
    result = _rule_negative_trend(scores)
    assert result.fired is True
    assert "trend_slope" in [f["feature"] for f in result.top_features]


def test_rule_negative_trend_not_fired_positive_slope():
    scores = [60.0, 65.0, 70.0, 75.0, 80.0]
    result = _rule_negative_trend(scores)
    assert result.fired is False


def test_rule_negative_trend_insufficient_data():
    """Fewer than RULE_TREND_MIN_ASSESSMENTS → no fire."""
    scores = [80.0, 60.0]  # only 2 data points
    result = _rule_negative_trend(scores)
    assert result.fired is False


def test_rule_negative_trend_mild_decline_no_fire():
    """Slight decline but above threshold — shouldn't trigger."""
    scores = [70.0, 69.0, 68.0, 67.0, 66.0]
    result = _rule_negative_trend(scores)
    # slope is -1, threshold is -2 → no fire
    assert result.fired is False


# ── Rule 3: Topic Accuracy ────────────────────────────────────────────────────

def test_rule_topic_accuracy_fires():
    """Low accuracy on multiple topics with enough attempts."""
    topic_scores = {
        "functions": [30.0, 35.0, 28.0, 32.0, 29.0],  # avg 30.8% < 50%
        "control_flow": [40.0, 45.0, 38.0, 42.0, 44.0],  # avg 41.8% < 50%
    }
    result = _rule_topic_accuracy(topic_scores)
    assert result.fired is True
    assert len(result.reasons) >= 1


def test_rule_topic_accuracy_not_fired():
    topic_scores = {
        "functions": [70.0, 75.0, 72.0, 80.0, 78.0],  # avg 75% > 50%
    }
    result = _rule_topic_accuracy(topic_scores)
    assert result.fired is False


def test_rule_topic_accuracy_insufficient_attempts():
    """Only 3 attempts — below RULE_TOPIC_MIN_ATTEMPTS (5)."""
    topic_scores = {"functions": [20.0, 25.0, 22.0]}
    result = _rule_topic_accuracy(topic_scores)
    assert result.fired is False


def test_rule_topic_accuracy_empty():
    result = _rule_topic_accuracy({})
    assert result.fired is False
