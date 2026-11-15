# ==============================================================================
# PIPELINE / MODEL COMPONENT: Database Engine & Session Factory
# TECH STACK: Python / SQLAlchemy 2.0 / Alembic / AsyncIO
# ==============================================================================
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """All ORM models inherit from this base."""


def _create_engine() -> AsyncEngine:
    url = settings.DATABASE_URL
    connect_args: dict = {}

    if "sqlite" in url:
        connect_args["check_same_thread"] = False
        return create_async_engine(
            url,
            connect_args=connect_args,
            echo=settings.DEBUG,
        )

    return create_async_engine(
        url,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        echo=settings.DEBUG,
        future=True,
    )


engine: AsyncEngine = _create_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    """Create all tables and auto-migrate new columns on existing dev SQLite tables."""
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Ensure new classroom assessment columns exist on student_diagnostics
        alter_statements = [
            "ALTER TABLE student_diagnostics ADD COLUMN roll_number VARCHAR(50)",
            "ALTER TABLE student_diagnostics ADD COLUMN mid1_marks FLOAT DEFAULT 15.0",
            "ALTER TABLE student_diagnostics ADD COLUMN mid2_marks FLOAT DEFAULT 15.0",
            "ALTER TABLE student_diagnostics ADD COLUMN internal_quiz_score FLOAT DEFAULT 5.0",
            "ALTER TABLE student_diagnostics ADD COLUMN assignment_score FLOAT DEFAULT 5.0",
            "ALTER TABLE student_diagnostics ADD COLUMN attendance_percentage FLOAT DEFAULT 80.0",
            "ALTER TABLE student_diagnostics ADD COLUMN lab_score FLOAT DEFAULT 10.0",
            "ALTER TABLE student_diagnostics ADD COLUMN participation_index FLOAT DEFAULT 3.0",
            "ALTER TABLE student_diagnostics ADD COLUMN aggregate_percentage FLOAT DEFAULT 50.0",
            "ALTER TABLE student_diagnostics ADD COLUMN risk_score FLOAT DEFAULT 0.5",
            "ALTER TABLE student_diagnostics ADD COLUMN category VARCHAR(40) DEFAULT 'Moderate Learner'",
        ]
        for stmt in alter_statements:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
