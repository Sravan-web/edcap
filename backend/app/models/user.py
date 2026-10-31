# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Users, Sessions, Tokens, MFA
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator, String as SAString

from app.core.database import Base


class GUID(TypeDecorator):
    """Platform-independent UUID type (native UUID on PG, VARCHAR on SQLite)."""
    impl = SAString(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return uuid.UUID(str(value))


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UserRole(str, PyEnum):
    STUDENT = "student"
    FACULTY = "faculty"
    ADMIN = "admin"


class UserStatus(str, PyEnum):
    PENDING = "pending"   # email not verified
    ACTIVE = "active"
    SUSPENDED = "suspended"


class TokenPurpose(str, PyEnum):
    VERIFY_EMAIL = "verify_email"
    RESET_PASSWORD = "reset_password"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum(UserRole, name="userrole"), nullable=False, default=UserRole.STUDENT
    )
    status: Mapped[str] = mapped_column(
        Enum(UserStatus, name="userstatus"), nullable=False, default=UserStatus.PENDING
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")

    # Auth state
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_device_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_ip_prefix: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # MFA
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Preferences
    theme: Mapped[str] = mapped_column(String(20), default="dark")
    font_preference: Mapped[str] = mapped_column(String(30), default="inter")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    sessions: Mapped[list[Session]] = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    one_time_tokens: Mapped[list[OneTimeToken]] = relationship("OneTimeToken", back_populates="user", cascade="all, delete-orphan")
    mfa_recovery_codes: Mapped[list[MFARecoveryCode]] = relationship("MFARecoveryCode", back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    device_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ip_prefix: Mapped[str | None] = mapped_column(String(32), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mfa_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_stepped_up: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_stepup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("ix_sessions_user_active", "user_id", "revoked_at"),
    )


class OneTimeToken(Base):
    __tablename__ = "one_time_tokens"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(Enum(TokenPurpose, name="tokenpurpose"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="one_time_tokens")


class MFARecoveryCode(Base):
    __tablename__ = "mfa_recovery_codes"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="mfa_recovery_codes")
