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
    """Create all tables (used in dev/test; production uses Alembic)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
