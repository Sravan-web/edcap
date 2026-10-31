# ==============================================================================
# PIPELINE / MODEL COMPONENT: ORM Models — Audit Log & Settings
# TECH STACK: Python / SQLAlchemy 2.0
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.user import GUID, utcnow


class AuditLog(Base):
    """Append-only security and action audit trail.
    Records: failed logins, lockouts, role changes, exports, admin actions,
    MFA events, password resets, flag overrides, quiz publications.
    Never contains passwords, tokens, OTPs or full personal data.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False, default="anonymous")
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    target_id: Mapped[str] = mapped_column(String(36), nullable=False, default="")
    ip_prefix: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    device_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)  # success | failure | blocked
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)   # safe, redacted context
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    __table_args__ = (
        Index("ix_audit_actor", "actor_id"),
        Index("ix_audit_action", "action"),
    )


class Setting(Base):
    """Key-value store for admin-editable thresholds and configuration."""
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(GUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
