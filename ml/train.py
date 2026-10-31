#!/usr/bin/env python3
# ==============================================================================
# PIPELINE / MODEL COMPONENT: ML Classifier — Train & Serialise
# TECH STACK: Python / LightGBM / scikit-learn / SHAP
# ==============================================================================
"""
Trains a LightGBM multiclass classifier (4 tracks) from synthetic data
and saves the model + label encoder for API inference.

Usage:
    cd miniproject
    python ml/train.py
"""
from __future__ import annotations

import json
import os

import joblib
import lightgbm as lgb
import numpy as np
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder

import pandas as pd

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
    # ── Load data ─────────────────────────────────────────────────────────────
    df = pd.read_csv(DATA_PATH)
    print(f"📊 Loaded {len(df)} rows from {DATA_PATH}")

    X = df[FEATURE_COLS].values
    le = LabelEncoder()
    y = le.fit_transform(df["track"])

    print(f"   Classes: {list(le.classes_)}")

    # ── Train ─────────────────────────────────────────────────────────────────
    params = {
        "objective": "multiclass",
        "num_class": len(le.classes_),
        "metric": "multi_logloss",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "max_depth": 6,
        "min_child_samples": 20,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "n_estimators": 300,
        "class_weight": "balanced",
        "random_state": 42,
        "verbosity": -1,
    }

    model = lgb.LGBMClassifier(**params)

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring="f1_macro")
    print(f"\n📈 5-Fold CV F1-macro: {scores.mean():.4f} ± {scores.std():.4f}")

    # Fit on full data
    model.fit(X, y)

    # Feature importance
    importances = model.feature_importances_
    imp_pairs = sorted(zip(FEATURE_COLS, importances), key=lambda x: x[1], reverse=True)
    print("\n🔍 Feature importance:")
    for feat, imp in imp_pairs:
        print(f"   {feat:<30} {imp:>6}")

    # ── Save artifacts ────────────────────────────────────────────────────────
    os.makedirs(MODEL_DIR, exist_ok=True)

    model_path = os.path.join(MODEL_DIR, "triage_classifier.pkl")
    encoder_path = os.path.join(MODEL_DIR, "label_encoder.pkl")
    metadata_path = os.path.join(MODEL_DIR, "model_metadata.json")

    joblib.dump(model, model_path)
    joblib.dump(le, encoder_path)

    metadata = {
        "model_type": "LGBMClassifier",
        "n_estimators": params["n_estimators"],
        "num_classes": len(le.classes_),
        "classes": list(le.classes_),
        "features": FEATURE_COLS,
        "cv_f1_macro_mean": round(float(scores.mean()), 4),
        "cv_f1_macro_std": round(float(scores.std()), 4),
        "feature_importance": {k: int(v) for k, v in imp_pairs},
    }
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n✅ Model saved → {model_path}")
    print(f"   Encoder  → {encoder_path}")
    print(f"   Metadata → {metadata_path}")


if __name__ == "__main__":
    main()
