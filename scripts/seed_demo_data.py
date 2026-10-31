#!/usr/bin/env python3
# ==============================================================================
# PIPELINE / MODEL COMPONENT: Demo Data Seeder
# TECH STACK: Python / SQLAlchemy 2.0 / AsyncIO
# ==============================================================================
"""
Seed the database with realistic demo data for development and testing.

Usage:
    cd backend
    python -m scripts.seed_demo_data
    # or:
    python scripts/seed_demo_data.py
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date, datetime, timedelta, timezone

# Add backend to sys.path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, create_tables
from app.core.security import hash_password
from app.models.assessment import Assessment, AssessmentScore
from app.models.audit import AuditLog, Setting
from app.models.course import Course, CourseFaculty, Enrollment, SyllabusTopic
from app.models.flag import EngagementStats, Playbook, RemedialQueueItem, SupportFlag
from app.models.module import LessonModule
from app.models.user import User, UserRole, UserStatus

settings = get_settings()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def seed(db: AsyncSession) -> None:
    print("🌱 Seeding demo data...")

    # ── Users ─────────────────────────────────────────────────────────────────
    admin = User(
        email="admin@edcap.demo",
        password_hash=hash_password("Admin@123456789"),
        role=UserRole.ADMIN.value,
        status=UserStatus.ACTIVE.value,
        first_name="System",
        last_name="Admin",
        email_verified_at=_utcnow(),
        mfa_enabled=False,
    )
    faculty1 = User(
        email="prof.sharma@edcap.demo",
        password_hash=hash_password("Faculty@123456789"),
        role=UserRole.FACULTY.value,
        status=UserStatus.ACTIVE.value,
        first_name="Ananya",
        last_name="Sharma",
        email_verified_at=_utcnow(),
    )
    faculty2 = User(
        email="prof.rajan@edcap.demo",
        password_hash=hash_password("Faculty@123456789"),
        role=UserRole.FACULTY.value,
        status=UserStatus.ACTIVE.value,
        first_name="Vikram",
        last_name="Rajan",
        email_verified_at=_utcnow(),
    )

    student_data = [
        ("Arjun", "Mehta", "arjun.mehta@edcap.demo"),
        ("Priya", "Nair", "priya.nair@edcap.demo"),
        ("Rahul", "Gupta", "rahul.gupta@edcap.demo"),
        ("Sneha", "Patel", "sneha.patel@edcap.demo"),
        ("Karan", "Singh", "karan.singh@edcap.demo"),
        ("Anika", "Verma", "anika.verma@edcap.demo"),
        ("Rohan", "Das", "rohan.das@edcap.demo"),
        ("Nisha", "Iyer", "nisha.iyer@edcap.demo"),
        ("Amit", "Kumar", "amit.kumar@edcap.demo"),
        ("Divya", "Reddy", "divya.reddy@edcap.demo"),
    ]
    students = []
    for fname, lname, email in student_data:
        s = User(
            email=email,
            password_hash=hash_password("Student@123456789"),
            role=UserRole.STUDENT.value,
            status=UserStatus.ACTIVE.value,
            first_name=fname,
            last_name=lname,
            email_verified_at=_utcnow(),
        )
        students.append(s)

    db.add_all([admin, faculty1, faculty2, *students])
    await db.flush()
    print(f"  ✅ Created {2 + len(students)} users (1 admin, 2 faculty, {len(students)} students)")

    # ── Courses ───────────────────────────────────────────────────────────────
    course1 = Course(code="CS101", name="Introduction to Programming", description="Fundamentals of Python programming and algorithm design.")
    course2 = Course(code="DS201", name="Data Structures & Algorithms", description="Arrays, trees, graphs, sorting, and complexity analysis.")
    course3 = Course(code="ML301", name="Machine Learning Foundations", description="Supervised/unsupervised learning, feature engineering, and model evaluation.")
    db.add_all([course1, course2, course3])
    await db.flush()
    print("  ✅ Created 3 courses")

    # ── Course Assignments ────────────────────────────────────────────────────
    db.add(CourseFaculty(faculty_id=faculty1.id, course_id=course1.id))
    db.add(CourseFaculty(faculty_id=faculty1.id, course_id=course2.id))
    db.add(CourseFaculty(faculty_id=faculty2.id, course_id=course3.id))

    # Enroll all students in course1 and course2, half in course3
    for s in students:
        db.add(Enrollment(student_id=s.id, course_id=course1.id))
        db.add(Enrollment(student_id=s.id, course_id=course2.id))
    for s in students[:5]:
        db.add(Enrollment(student_id=s.id, course_id=course3.id))
    await db.flush()
    print("  ✅ Created enrollments and faculty assignments")

    # ── Syllabus Topics ───────────────────────────────────────────────────────
    topics_cs101 = [
        SyllabusTopic(course_id=course1.id, name="Variables & Data Types", tag="variables", sort_order=1),
        SyllabusTopic(course_id=course1.id, name="Control Flow", tag="control_flow", sort_order=2),
        SyllabusTopic(course_id=course1.id, name="Functions", tag="functions", sort_order=3),
        SyllabusTopic(course_id=course1.id, name="Lists & Dictionaries", tag="collections", sort_order=4),
        SyllabusTopic(course_id=course1.id, name="File I/O", tag="file_io", sort_order=5),
    ]
    db.add_all(topics_cs101)
    await db.flush()

    # ── Assessments & Scores ──────────────────────────────────────────────────
    base_date = date.today() - timedelta(days=60)
    assessments_cs101 = []
    for i in range(8):
        a = Assessment(
            course_id=course1.id,
            title=f"Weekly Quiz {i+1}",
            assessment_date=base_date + timedelta(weeks=i),
            topic_tag=topics_cs101[i % len(topics_cs101)].tag,
            source="manual",
            created_by=faculty1.id,
        )
        assessments_cs101.append(a)
    db.add_all(assessments_cs101)
    await db.flush()

    import random
    random.seed(42)
    for student in students:
        # Simulate some at-risk students with declining scores
        is_at_risk = student in students[:3]
        for i, assessment in enumerate(assessments_cs101):
            if is_at_risk:
                base_score = max(20, 65 - i * 5 + random.gauss(0, 5))
            else:
                base_score = min(95, 70 + i * 2 + random.gauss(0, 8))
            final_score = round(max(0, min(100, base_score)), 1)
            score = AssessmentScore(
                student_id=student.id,
                assessment_id=assessment.id,
                topic_id=topics_cs101[i % len(topics_cs101)].id,
                topic_tag=topics_cs101[i % len(topics_cs101)].tag,
                score=final_score,
                max_score=100.0,
                percentage=final_score,
            )
            db.add(score)
    await db.flush()
    print(f"  ✅ Created {len(assessments_cs101)} assessments with scores for {len(students)} students")

    # ── Support Flags ─────────────────────────────────────────────────────────
    at_risk_students = students[:3]
    for s in at_risk_students:
        flag = SupportFlag(
            student_id=s.id,
            course_id=course1.id,
            track="A_foundational",
            risk_score=round(random.uniform(0.6, 0.95), 3),
            reasons=json.dumps([
                "Score trend slope is negative (-3.2)",
                f"Score below class average in 4 of last 5 assessments",
            ]),
            top_features=json.dumps([
                {"feature": "trend_slope", "value": -3.2, "plain_language": "Scores are declining each week"},
                {"feature": "below_avg_fires", "value": 4, "plain_language": "Consistently below class average"},
            ]),
            status="open",
        )
        db.add(flag)
    await db.flush()
    print(f"  ✅ Created {len(at_risk_students)} support flags")

    # ── Engagement Stats ──────────────────────────────────────────────────────
    for s in students:
        streak = random.randint(1, 14) if s not in at_risk_students else random.randint(0, 3)
        db.add(EngagementStats(
            student_id=s.id,
            course_id=course1.id,
            current_streak=streak,
            longest_streak=streak + random.randint(0, 7),
            retention_points=streak * 10 + random.randint(0, 50),
            last_activity_date=_utcnow() - timedelta(days=random.randint(0, 3)),
        ))
    await db.flush()

    # ── Remedial Queue ────────────────────────────────────────────────────────
    for s in at_risk_students:
        db.add(RemedialQueueItem(
            student_id=s.id,
            topic_id=topics_cs101[1].id,
            course_id=course1.id,
            next_review_at=_utcnow() + timedelta(days=1),
            interval_days=1,
        ))
    await db.flush()

    # ── Settings ──────────────────────────────────────────────────────────────
    default_settings = [
        Setting(key="rule.below_avg_pct", value="15.0", description="Below-average threshold %", updated_by=admin.id),
        Setting(key="rule.trend_slope", value="-2.0", description="Trend slope threshold", updated_by=admin.id),
        Setting(key="rule.topic_accuracy_pct", value="50.0", description="Topic accuracy threshold %", updated_by=admin.id),
        Setting(key="quiz.questions_per_day", value="20", description="Daily quiz question count", updated_by=admin.id),
        Setting(key="notification.email_enabled", value="true", description="Email notifications enabled", updated_by=admin.id),
    ]
    db.add_all(default_settings)
    await db.flush()

    # ── Audit log entry ───────────────────────────────────────────────────────
    db.add(AuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="system.seed_data",
        target_type="system",
        target_id="seed",
        outcome="success",
        detail="Demo data seeded successfully",
    ))

    await db.commit()
    print("\n✅ Demo data seeding complete!")
    print("\n📋 Demo Credentials:")
    print("  Admin:   admin@edcap.demo / Admin@123456789")
    print("  Faculty: prof.sharma@edcap.demo / Faculty@123456789")
    print("  Student: arjun.mehta@edcap.demo / Student@123456789")


async def main() -> None:
    print("🔧 Creating tables (if needed)...")
    await create_tables()
    async with AsyncSessionLocal() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
