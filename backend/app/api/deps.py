# ==============================================================================
# PIPELINE / MODEL COMPONENT: FastAPI Dependency Injection — Auth & RBAC
# TECH STACK: Python / FastAPI / SQLAlchemy
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import decode_token, hash_token
from app.models.user import Session, User, UserRole, UserStatus

logger = get_logger(__name__)
settings = get_settings()

# ── Credential Extraction ─────────────────────────────────────────────────────


async def _get_token_from_cookie(
    access_token: str | None = Cookie(default=None),
    authorization: str | None = None,
) -> str | None:
    return access_token


async def _resolve_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate the access token from HttpOnly cookie, check session validity,
    enforce idle and absolute timeouts, and return the authenticated User.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.")

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    # Load session from DB
    token_hash = hash_token(token)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = await db.execute(
        select(Session).where(
            Session.token_hash == token_hash,
            Session.revoked_at == None,  # noqa: E711
            Session.expires_at > now,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found or expired.")

    # Idle timeout check
    idle_cutoff = now - timedelta(minutes=settings.SESSION_IDLE_TIMEOUT_MIN)
    if session.last_seen_at < idle_cutoff:
        session.revoked_at = now
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired due to inactivity.")

    # Absolute timeout check
    abs_cutoff = session.created_at + timedelta(hours=settings.SESSION_ABS_TIMEOUT_H)
    if now > abs_cutoff:
        session.revoked_at = now
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has exceeded the maximum duration.")

    # Update last_seen_at
    session.last_seen_at = now
    await db.flush()

    # Load user
    result = await db.execute(select(User).where(User.id == uuid.UUID(str(user_id))))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not active.")

    # Attach session to request state for downstream use
    request.state.session = session
    return user


CurrentUser = Annotated[User, Depends(_resolve_current_user)]


# ── Role Guards ───────────────────────────────────────────────────────────────

def require_role(*roles: UserRole):
    """Factory for role-checking dependencies."""
    async def _check(current_user: CurrentUser) -> User:
        if current_user.role not in [r.value if isinstance(r, UserRole) else r for r in roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return current_user
    return _check


RequireStudent = Depends(require_role(UserRole.STUDENT))
RequireFaculty = Depends(require_role(UserRole.FACULTY, UserRole.ADMIN))
RequireAdmin = Depends(require_role(UserRole.ADMIN))


# ── MFA Guards ────────────────────────────────────────────────────────────────

async def require_mfa(current_user: CurrentUser, request: Request) -> User:
    """
    Faculty and Admin MUST have MFA verified on their session.
    Students with MFA enabled must also have it verified.
    """
    role = current_user.role
    needs_mfa = role in (UserRole.FACULTY.value, UserRole.ADMIN.value) or current_user.mfa_enabled

    if needs_mfa:
        session: Session = getattr(request.state, "session", None)
        if not session or not session.mfa_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA verification required. Please complete two-factor authentication.",
            )
    return current_user


MFARequired = Depends(require_mfa)


async def require_mfa_stepup(current_user: CurrentUser, request: Request) -> User:
    """
    Step-up MFA for sensitive actions (quiz publish, export, role change, etc.)
    The session must have mfa_stepped_up = True and stepup_at within the window.
    """
    session: Session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found.")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stepup_valid = (
        session.mfa_stepped_up
        and session.mfa_stepup_at is not None
        and (now - session.mfa_stepup_at).total_seconds() < settings.MFA_STEPUP_VALID_MINUTES * 60
    )

    if not stepup_valid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Step-up MFA required for this action. Please re-verify your authenticator.",
        )
    return current_user


MFAStepUpRequired = Depends(require_mfa_stepup)


# ── Course Ownership Guard ────────────────────────────────────────────────────

async def require_course_faculty(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Ensure the authenticated faculty is assigned to the given course."""
    from app.models.course import CourseFaculty
    if current_user.role == UserRole.ADMIN.value:
        return  # admin bypasses
    result = await db.execute(
        select(CourseFaculty).where(
            CourseFaculty.faculty_id == current_user.id,
            CourseFaculty.course_id == course_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this course.",
        )
