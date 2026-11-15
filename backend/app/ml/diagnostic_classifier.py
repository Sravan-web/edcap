# ==============================================================================
# ML COMPONENT: Slow Learner Diagnostic Classifier & Ensemble
# Reference: Sangeeta et al. (IJCTT 2020) & Nalawade & Pujari (2025)
# Vocabulary: Low (Slow) -> Developing | Average -> Proficient | Fast -> Advanced
# ==============================================================================
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Tuple
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import StandardScaler

Tier = Literal["Developing", "Proficient", "Advanced"]

FEATURE_NAMES = [
    "marks",
    "class_performance",
    "cgpa",
    "urban_rural",
    "analytical_thinking",
    "knowledge_level",
    "problem_solving_skills",
    "decision_making",
    "errors",
]

@dataclass
class StudentDiagnosticInput:
    student_id: str
    student_name: str
    marks: float  # 0 to 100
    class_performance: float  # 1 to 5
    cgpa: float  # 0.0 to 10.0
    urban_rural: str  # "Urban" or "Rural"
    analytical_thinking: float  # 1 to 5
    knowledge_level: float  # 1 to 5
    problem_solving_skills: float  # 1 to 5
    decision_making: float  # 1 to 5
    errors: float  # 1 to 5 (1 = frequent errors/misconceptions, 5 = rarely makes errors)

@dataclass
class DiagnosticEvaluationResult:
    student_id: str
    student_name: str
    tier: Tier
    learner_score: float  # 0 to 100
    is_slow_learner: bool  # True if tier == "Developing"
    confidence: float  # 0 to 1.0
    model_votes: Dict[str, str]
    weak_dimensions: List[str]
    recommendation: str
    feature_radar: Dict[str, float]  # Normalized 0-100 for radar graphing


class DiagnosticEnsemble:
    _instance = None

    def __init__(self):
        self.scaler = StandardScaler()
        self.rf = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=6)
        self.dt = DecisionTreeClassifier(max_depth=5, random_state=42)
        self.knn = KNeighborsClassifier(n_neighbors=5)
        self.svm = SVC(kernel="rbf", probability=True, random_state=42)
        self.nb = GaussianNB()
        self.is_trained = False
        self._train_calibrated_benchmark()

    @classmethod
    def get_instance(cls) -> "DiagnosticEnsemble":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _generate_synthetic_benchmark(self, n_samples: int = 600) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate synthetic training distribution matching Table 2 of Sangeeta et al. (2020):
        Developing (Slow): ~20%
        Proficient (Average): ~45%
        Advanced (Fast): ~35%
        """
        rng = np.random.RandomState(42)
        n_dev = int(n_samples * 0.20)
        n_pro = int(n_samples * 0.45)
        n_adv = n_samples - n_dev - n_pro

        # Developing: low marks, low class_perf, low cgpa, lower cognitive ratings, frequent errors (low score)
        dev_marks = np.clip(rng.normal(42, 10, n_dev), 15, 62)
        dev_cp = np.clip(rng.normal(1.9, 0.6, n_dev), 1.0, 3.0)
        dev_cgpa = np.clip(rng.normal(5.4, 0.8, n_dev), 3.0, 6.8)
        dev_ur = rng.choice([0, 1], size=n_dev, p=[0.55, 0.45])
        dev_at = np.clip(rng.normal(2.1, 0.7, n_dev), 1.0, 3.2)
        dev_kl = np.clip(rng.normal(2.2, 0.6, n_dev), 1.0, 3.2)
        dev_ps = np.clip(rng.normal(1.8, 0.6, n_dev), 1.0, 3.0)
        dev_dm = np.clip(rng.normal(2.0, 0.6, n_dev), 1.0, 3.2)
        dev_er = np.clip(rng.normal(1.9, 0.6, n_dev), 1.0, 3.0)  # Low error control = high misconceptions

        X_dev = np.column_stack([dev_marks, dev_cp, dev_cgpa, dev_ur, dev_at, dev_kl, dev_ps, dev_dm, dev_er])
        y_dev = np.array(["Developing"] * n_dev)

        # Proficient: medium marks, moderate engagement, solid fundamentals
        pro_marks = np.clip(rng.normal(67, 8, n_pro), 52, 79)
        pro_cp = np.clip(rng.normal(3.3, 0.5, n_pro), 2.4, 4.2)
        pro_cgpa = np.clip(rng.normal(7.2, 0.6, n_pro), 6.0, 8.4)
        pro_ur = rng.choice([0, 1], size=n_pro, p=[0.45, 0.55])
        pro_at = np.clip(rng.normal(3.3, 0.6, n_pro), 2.2, 4.3)
        pro_kl = np.clip(rng.normal(3.4, 0.5, n_pro), 2.4, 4.4)
        pro_ps = np.clip(rng.normal(3.2, 0.6, n_pro), 2.2, 4.2)
        pro_dm = np.clip(rng.normal(3.2, 0.5, n_pro), 2.3, 4.3)
        pro_er = np.clip(rng.normal(3.3, 0.5, n_pro), 2.3, 4.3)

        X_pro = np.column_stack([pro_marks, pro_cp, pro_cgpa, pro_ur, pro_at, pro_kl, pro_ps, dev_dm if False else pro_dm, pro_er])
        y_pro = np.array(["Proficient"] * n_pro)

        # Advanced: high marks, active engagement, superior problem solving & analytical thinking
        adv_marks = np.clip(rng.normal(88, 6, n_adv), 75, 100)
        adv_cp = np.clip(rng.normal(4.6, 0.4, n_adv), 3.8, 5.0)
        adv_cgpa = np.clip(rng.normal(8.9, 0.5, n_adv), 7.8, 10.0)
        adv_ur = rng.choice([0, 1], size=n_adv, p=[0.35, 0.65])
        adv_at = np.clip(rng.normal(4.6, 0.4, n_adv), 3.8, 5.0)
        adv_kl = np.clip(rng.normal(4.7, 0.3, n_adv), 4.0, 5.0)
        adv_ps = np.clip(rng.normal(4.6, 0.4, n_adv), 3.8, 5.0)
        adv_dm = np.clip(rng.normal(4.5, 0.4, n_adv), 3.7, 5.0)
        adv_er = np.clip(rng.normal(4.6, 0.4, n_adv), 3.8, 5.0)

        X_adv = np.column_stack([adv_marks, adv_cp, adv_cgpa, adv_ur, adv_at, adv_kl, adv_ps, adv_dm, adv_er])
        y_adv = np.array(["Advanced"] * n_adv)

        X = np.vstack([X_dev, X_pro, X_adv])
        y = np.concatenate([y_dev, y_pro, y_adv])
        return X, y

    def _train_calibrated_benchmark(self):
        X, y = self._generate_synthetic_benchmark()
        X_scaled = self.scaler.fit_transform(X)

        self.rf.fit(X_scaled, y)
        self.dt.fit(X_scaled, y)
        self.knn.fit(X_scaled, y)
        self.svm.fit(X_scaled, y)
        self.nb.fit(X_scaled, y)
        self.is_trained = True

    def evaluate(self, student: StudentDiagnosticInput) -> DiagnosticEvaluationResult:
        ur_val = 1.0 if str(student.urban_rural).strip().lower() == "urban" else 0.0
        row = np.array([[
            student.marks,
            student.class_performance,
            student.cgpa,
            ur_val,
            student.analytical_thinking,
            student.knowledge_level,
            student.problem_solving_skills,
            student.decision_making,
            student.errors,
        ]])

        row_scaled = self.scaler.transform(row)

        votes: Dict[str, str] = {
            "Random Forest": str(self.rf.predict(row_scaled)[0]),
            "Decision Tree (J48)": str(self.dt.predict(row_scaled)[0]),
            "k-NN": str(self.knn.predict(row_scaled)[0]),
            "SVM": str(self.svm.predict(row_scaled)[0]),
            "Naïve Bayes": str(self.nb.predict(row_scaled)[0]),
        }

        # Ensemble consensus voting
        vote_counts = {"Developing": 0, "Proficient": 0, "Advanced": 0}
        for pred in votes.values():
            if pred in vote_counts:
                vote_counts[pred] += 1

        tier = max(vote_counts, key=vote_counts.get)  # type: ignore
        consensus_count = vote_counts[tier]
        confidence = round(consensus_count / len(votes), 2)

        # Composite Learner Score (0-100) combining cognitive metrics + marks + CGPA
        # Marks (30%), CGPA (20%), Problem Solving (15%), Analytical (15%), Class Perf (10%), Knowledge/Errors (10%)
        marks_norm = np.clip(student.marks, 0, 100)
        cgpa_norm = np.clip(student.cgpa * 10, 0, 100)
        ps_norm = np.clip((student.problem_solving_skills / 5.0) * 100, 0, 100)
        at_norm = np.clip((student.analytical_thinking / 5.0) * 100, 0, 100)
        cp_norm = np.clip((student.class_performance / 5.0) * 100, 0, 100)
        kl_norm = np.clip((student.knowledge_level / 5.0) * 100, 0, 100)
        er_norm = np.clip((student.errors / 5.0) * 100, 0, 100)

        composite_score = round(
            (marks_norm * 0.30) +
            (cgpa_norm * 0.20) +
            (ps_norm * 0.15) +
            (at_norm * 0.15) +
            (cp_norm * 0.10) +
            (kl_norm * 0.05) +
            (er_norm * 0.05),
            1,
        )

        # If score is very low or consensus is Developing, enforce Developing tier
        if composite_score < 52.0:
            tier = "Developing"
        elif composite_score >= 76.0 and tier == "Developing":
            tier = "Proficient"

        is_slow = (tier == "Developing")

        # Weak dimensions identification
        weaknesses = []
        if student.marks < 50:
            weaknesses.append("Low Academic Marks (<50%)")
        if student.problem_solving_skills <= 2.5:
            weaknesses.append("Programming & Logic Formulation Deficit")
        if student.errors <= 2.5:
            weaknesses.append("Frequent Syntax Misconceptions & Bug Identification Errors")
        if student.analytical_thinking <= 2.5:
            weaknesses.append("Analytical & Algorithmic Reasoning Gap")
        if student.knowledge_level <= 2.5:
            weaknesses.append("Core Concept Recall & Definition Gaps")
        if student.class_performance <= 2.0:
            weaknesses.append("Passive Classroom & Lab Engagement")

        # Recommendation
        if is_slow:
            recommendation = (
                "Identified as Developing learner. Mandatory assignment of foundational remedial quiz "
                "covering basic programming syntax, error debugging, and step-by-step trace analysis."
            )
        elif tier == "Proficient":
            recommendation = (
                "Student shows Proficient capability. Provide standard reinforcement problem sets and "
                "guided peer coding practice."
            )
        else:
            recommendation = (
                "Student exhibits Advanced mastery. Recommend competitive programming problems and "
                "independent algorithmic projects."
            )

        radar = {
            "Academic Marks": float(round(marks_norm, 1)),
            "Problem Solving": float(round(ps_norm, 1)),
            "Analytical Thinking": float(round(at_norm, 1)),
            "Error Control": float(round(er_norm, 1)),
            "Concept Knowledge": float(round(kl_norm, 1)),
            "Class Engagement": float(round(cp_norm, 1)),
        }

        return DiagnosticEvaluationResult(
            student_id=str(student.student_id),
            student_name=str(student.student_name),
            tier=tier,
            learner_score=float(composite_score),
            is_slow_learner=bool(is_slow),
            confidence=float(confidence),
            model_votes={str(k): str(v) for k, v in votes.items()},
            weak_dimensions=weaknesses,
            recommendation=recommendation,
            feature_radar=radar,
        )
