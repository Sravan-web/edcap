#!/usr/bin/env python3
# ==============================================================================
# PIPELINE / MODEL COMPONENT: ML Classifier — Evaluation & Reporting
# TECH STACK: Python / scikit-learn / SHAP
# ==============================================================================
"""
Evaluate the trained triage classifier on test data.

Usage:
    cd miniproject
    python ml/evaluate.py
"""
from __future__ import annotations

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split

FEATURE_COLS = [
    "velocity_decay_score",
    "format_preference_delta",
    "hesitation_index",
    "persistence_decay_rate",
    "topic_accuracy",
    "trend_slope",
    "streak_consistency",
    "prereq_accuracy",
    "reading_speed",
]

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "synthetic_train.csv")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")


def main() -> None:
    # ── Load ──────────────────────────────────────────────────────────────────
    df = pd.read_csv(DATA_PATH)
    model = joblib.load(os.path.join(MODEL_DIR, "triage_classifier.pkl"))
    le = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))

    # ── Hold-out split ────────────────────────────────────────────────────────
    X = df[FEATURE_COLS].values
    y_true = le.transform(df["track"])

    _, X_test, _, y_test = train_test_split(
        X, y_true, test_size=0.20, stratify=y_true, random_state=42
    )

    y_pred = model.predict(X_test)

    # ── Metrics ───────────────────────────────────────────────────────────────
    print("=" * 60)
    print("📊 Evaluation Results")
    print("=" * 60)
    print(f"\nAccuracy:  {accuracy_score(y_test, y_pred):.4f}")
    print(f"F1-macro:  {f1_score(y_test, y_pred, average='macro'):.4f}")
    print(f"F1-weighted: {f1_score(y_test, y_pred, average='weighted'):.4f}")

    print("\n📋 Classification Report:")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    print("📊 Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    labels = le.classes_
    print(f"{'':>20}", end="")
    for l in labels:
        print(f"{l:>18}", end="")
    print()
    for i, row in enumerate(cm):
        print(f"{labels[i]:>20}", end="")
        for v in row:
            print(f"{v:>18}", end="")
        print()

    # ── SHAP (top 5 features per class) ───────────────────────────────────────
    try:
        import shap

        print("\n🔍 SHAP Feature Importance (global):")
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_test[:200])

        for cls_idx, cls_name in enumerate(le.classes_):
            if isinstance(shap_values, list):
                cls_shap = np.abs(shap_values[cls_idx]).mean(axis=0)
            else:
                cls_shap = np.abs(shap_values[:, :, cls_idx]).mean(axis=0)
            top_idx = np.argsort(cls_shap)[::-1][:5]
            top_feats = [(FEATURE_COLS[i], round(float(cls_shap[i]), 4)) for i in top_idx]
            print(f"\n  {cls_name}:")
            for feat, val in top_feats:
                print(f"    {feat:<30} {val:.4f}")

    except Exception as e:
        print(f"\n⚠️  SHAP analysis skipped: {e}")

    # ── Save evaluation report ────────────────────────────────────────────────
    report = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "f1_weighted": round(float(f1_score(y_test, y_pred, average="weighted")), 4),
        "test_size": len(y_test),
        "confusion_matrix": cm.tolist(),
        "classes": list(le.classes_),
    }
    report_path = os.path.join(MODEL_DIR, "evaluation_report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n✅ Report saved → {report_path}")


if __name__ == "__main__":
    main()
