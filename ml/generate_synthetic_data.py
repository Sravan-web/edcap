#!/usr/bin/env python3
# ==============================================================================
# PIPELINE / MODEL COMPONENT: Synthetic Data Generator for ML Training
# TECH STACK: Python / NumPy / Pandas
# ==============================================================================
"""
Generates synthetic labelled data for the student triage classifier.

Output: ml/data/synthetic_train.csv — one row per student-course snapshot,
with all 9 features from §6.1 and the true support track label.

Usage:
    cd miniproject
    python ml/generate_synthetic_data.py
"""
from __future__ import annotations

import os
import random

import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

N = 3000  # total synthetic rows

TRACKS = {
    "normal":         0.50,
    "A_foundational": 0.22,
    "B_language":     0.15,
    "C_engagement":   0.13,
}


def _generate_row(track: str) -> dict:
    """Generate one student feature snapshot with track-conditioned distributions."""

    if track == "normal":
        velocity_decay_score     = np.clip(np.random.normal(0.85, 0.10), 0, 1)
        format_preference_delta  = np.clip(np.random.normal(0.15, 0.10), 0, 1)
        hesitation_index         = np.clip(np.random.normal(1.5, 1.0), 0, 10)
        persistence_decay_rate   = np.clip(np.random.normal(0.10, 0.08), 0, 1)
        topic_accuracy           = np.clip(np.random.normal(0.75, 0.10), 0, 1)
        trend_slope              = np.random.normal(0.5, 1.5)
        streak_consistency       = np.clip(np.random.normal(0.80, 0.15), 0, 1)
        prereq_accuracy          = np.clip(np.random.normal(0.80, 0.10), 0, 1)
        reading_speed            = np.clip(np.random.normal(0.70, 0.15), 0, 1)

    elif track == "A_foundational":
        velocity_decay_score     = np.clip(np.random.normal(0.45, 0.15), 0, 1)
        format_preference_delta  = np.clip(np.random.normal(0.20, 0.15), 0, 1)
        hesitation_index         = np.clip(np.random.normal(4.5, 2.0), 0, 10)
        persistence_decay_rate   = np.clip(np.random.normal(0.35, 0.15), 0, 1)
        topic_accuracy           = np.clip(np.random.normal(0.38, 0.12), 0, 1)
        trend_slope              = np.random.normal(-3.0, 2.0)
        streak_consistency       = np.clip(np.random.normal(0.45, 0.20), 0, 1)
        prereq_accuracy          = np.clip(np.random.normal(0.40, 0.15), 0, 1)
        reading_speed            = np.clip(np.random.normal(0.50, 0.15), 0, 1)

    elif track == "B_language":
        velocity_decay_score     = np.clip(np.random.normal(0.60, 0.15), 0, 1)
        format_preference_delta  = np.clip(np.random.normal(0.55, 0.20), 0, 1)
        hesitation_index         = np.clip(np.random.normal(5.0, 2.0), 0, 10)
        persistence_decay_rate   = np.clip(np.random.normal(0.20, 0.12), 0, 1)
        topic_accuracy           = np.clip(np.random.normal(0.50, 0.12), 0, 1)
        trend_slope              = np.random.normal(-1.0, 1.5)
        streak_consistency       = np.clip(np.random.normal(0.65, 0.15), 0, 1)
        prereq_accuracy          = np.clip(np.random.normal(0.55, 0.15), 0, 1)
        reading_speed            = np.clip(np.random.normal(0.35, 0.12), 0, 1)

    else:  # C_engagement
        velocity_decay_score     = np.clip(np.random.normal(0.55, 0.18), 0, 1)
        format_preference_delta  = np.clip(np.random.normal(0.25, 0.15), 0, 1)
        hesitation_index         = np.clip(np.random.normal(2.0, 1.5), 0, 10)
        persistence_decay_rate   = np.clip(np.random.normal(0.55, 0.18), 0, 1)
        topic_accuracy           = np.clip(np.random.normal(0.55, 0.15), 0, 1)
        trend_slope              = np.random.normal(-2.5, 2.0)
        streak_consistency       = np.clip(np.random.normal(0.25, 0.15), 0, 1)
        prereq_accuracy          = np.clip(np.random.normal(0.60, 0.15), 0, 1)
        reading_speed            = np.clip(np.random.normal(0.55, 0.18), 0, 1)

    return {
        "velocity_decay_score":    round(velocity_decay_score, 4),
        "format_preference_delta": round(format_preference_delta, 4),
        "hesitation_index":        round(hesitation_index, 4),
        "persistence_decay_rate":  round(persistence_decay_rate, 4),
        "topic_accuracy":          round(topic_accuracy, 4),
        "trend_slope":             round(trend_slope, 4),
        "streak_consistency":      round(streak_consistency, 4),
        "prereq_accuracy":         round(prereq_accuracy, 4),
        "reading_speed":           round(reading_speed, 4),
        "track":                   track,
    }


def main() -> None:
    rows = []
    for track, proportion in TRACKS.items():
        count = int(N * proportion)
        for _ in range(count):
            rows.append(_generate_row(track))

    random.shuffle(rows)
    df = pd.DataFrame(rows)

    out_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "synthetic_train.csv")
    df.to_csv(out_path, index=False)

    print(f"✅ Generated {len(df)} rows → {out_path}")
    print(f"   Class distribution:")
    for track, count in df["track"].value_counts().items():
        print(f"     {track}: {count} ({count / len(df) * 100:.0f}%)")


if __name__ == "__main__":
    main()
