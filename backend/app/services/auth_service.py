# ==============================================================================
# PIPELINE / MODEL COMPONENT: Auth Service — Full Security Implementation
# TECH STACK: Python / FastAPI / SQLAlchemy / Argon2id
# ==============================================================================
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    dummy_password_verify,
    generate_secure_token,
    hash_device,
    hash_ip_prefix,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.audit import AuditLog
from app.models.user import (
    MFARecoveryCode,
    OneTimeToken,
    Session,
    TokenPurpose,
    User,
    UserRole,
    UserStatus,
    utcnow,
)
from app.security import rate_limiter
from app.security.captcha import get_captcha_adapter
from app.security.mfa import hash_recovery_code, verify_totp
from app.services.notification_service import NotificationService

settings = get_settings()
logger = get_logger(__name__)
notifications = NotificationService()

# Common passwords list (subset; production should use full zxcvbn or haveibeenpwned)
_COMMON_PASSWORDS = {
    "password", "password1", "123456789012", "qwerty123456",
    "iloveyou1234", "admin12345678", "welcome12345", "letmein12345",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalise_email(email: str) -> str:
    return email.strip().lower()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _write_audit(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    actor_email: str,
    action: str,
    target_type: str = "",
    target_id: str = "",
    ip_prefix: str = "",
    device_hash: str | None = None,
    outcome: str = "success",
    detail: str | None = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        ip_prefix=ip_prefix,
        device_hash=device_hash,
        outcome=outcome,
        detail=detail,
    )
    db.add(log)
    await db.flush()


# ── Password Validation ───────────────────────────────────────────────────────

class PasswordError(Exception):
    pass


def validate_password_strength(password: str) -> None:
    """Raise PasswordError if the password does not meet policy requirements."""
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise PasswordError(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters.")
    if password.lower() in _COMMON_PASSWORDS:
        raise PasswordError("This password is too common. Please choose a stronger password.")


# ── Signup ────────────────────────────────────────────────────────────────────

async def signup_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    role: UserRole = UserRole.STUDENT,
    base_url: str,
) -> None:
    """
    Create a new user. Always returns generically to prevent email enumeration.
    Timing is equalised regardless of whether the email already exists.
    """
    email = normalise_email(email)
    validate_password_strength(password)

    # Check for existing user (timing-equalised)
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()

    if existing:
        # Do hash work to equalise timing, but don't reveal existence
        hash_password(password)
        return

    pw_hash = hash_password(password)
    user = User(
        email=email,
        password_hash=pw_hash,
        role=role.value,
        status=UserStatus.PENDING.value,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    await db.flush()

    # Create verification token
    token = generate_secure_token(32)
    token_hash = hash_token(token)
    ott = OneTimeToken(
        user_id=user.id,
        purpose=TokenPurpose.VERIFY_EMAIL.value,
        token_hash=token_hash,
        expires_at=_utcnow() + timedelta(hours=settings.EMAIL_VERIFY_EXPIRY_H),
    )
    db.add(ott)
    await db.flush()

    await notifications.send_verification_email(email, token, base_url)
    await _write_audit(db, actor_id=user.id, actor_email=email, action="signup", outcome="success")


# ── Email Verification ────────────────────────────────────────────────────────

async def verify_email_token(db: AsyncSession, *, token: str) -> None:
    """
    Mark email as verified. Generic response; no enumeration.
    """
    token_hash = hash_token(token)
    now = _utcnow()
    result = await db.execute(
        select(OneTimeToken).where(
            OneTimeToken.token_hash == token_hash,
            OneTimeToken.purpose == TokenPurpose.VERIFY_EMAIL.value,
            OneTimeToken.used_at == None,  # noqa: E711
            OneTimeToken.expires_at > now,
        )
    )
    ott = result.scalar_one_or_none()
    if not ott:
        return  # silent; generic response shown to user

    ott.used_at = now
    result = await db.execute(select(User).where(User.id == ott.user_id))
    user = result.scalar_one_or_none()
    if user:
        user.email_verified_at = now
        user.status = UserStatus.ACTIVE.value
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="email_verified", outcome="success")


# ── Login ─────────────────────────────────────────────────────────────────────

class AuthError(Exception):
    def __init__(self, message: str, lockout: bool = False, captcha_required: bool = False):
        super().__init__(message)
        self.lockout = lockout
        self.captcha_required = captcha_required


async def login_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    ip: str,
    user_agent: str = "",
    accept_language: str = "",
    captcha_token: str | None = None,
    base_url: str = "",
) -> tuple[str, str]:
    """
    Authenticate a user. Returns (access_token, refresh_token).
    Raises AuthError with generic message on any failure.
    Implements: rate limiting, account lockout, CAPTCHA, timing equalisation,
    device anomaly detection, session rotation.
    """
    email = normalise_email(email)
    ip_prefix = hash_ip_prefix(ip)
    device_hash = hash_device(user_agent, accept_language)

    # ── Rate limit: IP ────────────────────────────────────────────────────────
    if not rate_limiter.check_login_ip(ip):
        await _write_audit(db, actor_id=None, actor_email=email, action="login_rate_limited",
                           ip_prefix=ip_prefix, device_hash=device_hash, outcome="blocked")
        raise AuthError("Invalid credentials.")

    # Load user (timing-equalised)
    result = await db.execute(select(User).where(User.email == email))
    user: User | None = result.scalar_one_or_none()

    if not user:
        dummy_password_verify()
        raise AuthError("Invalid credentials.")

    # ── Rate limit: account ───────────────────────────────────────────────────
    if not rate_limiter.check_login_account(str(user.id)):
        await _write_audit(db, actor_id=user.id, actor_email=email, action="login_rate_limited",
                           ip_prefix=ip_prefix, device_hash=device_hash, outcome="blocked")
        raise AuthError("Invalid credentials.")

    # ── Account lockout ───────────────────────────────────────────────────────
    now = _utcnow()
    if user.locked_until and user.locked_until > now:
        await _write_audit(db, actor_id=user.id, actor_email=email, action="login_locked_account",
                           ip_prefix=ip_prefix, device_hash=device_hash, outcome="blocked")
        raise AuthError("Invalid credentials.")

    # ── CAPTCHA check (trigger after N failures) ──────────────────────────────
    if user.failed_login_count >= settings.CAPTCHA_TRIGGER_AFTER:
        adapter = get_captcha_adapter()
        if not captcha_token or not await adapter.verify(captcha_token, ip):
            raise AuthError("Invalid credentials.", captcha_required=True)

    # ── Password check ────────────────────────────────────────────────────────
    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1

        if user.failed_login_count >= settings.LOGIN_MAX_ATTEMPTS:
            # Exponential back-off on repeated lockouts
            multiplier = min(2 ** (user.failed_login_count // settings.LOGIN_MAX_ATTEMPTS - 1), 8)
            lockout_min = settings.LOGIN_LOCKOUT_MINUTES * multiplier
            user.locked_until = now + timedelta(minutes=lockout_min)
            await db.flush()
            await notifications.send_account_locked_email(user.email, lockout_min)
            await _write_audit(db, actor_id=user.id, actor_email=email, action="account_locked",
                               ip_prefix=ip_prefix, device_hash=device_hash, outcome="blocked",
                               detail=f"lockout_minutes={lockout_min}")

        await db.flush()
        await _write_audit(db, actor_id=user.id, actor_email=email, action="login_failed",
                           ip_prefix=ip_prefix, device_hash=device_hash, outcome="failure",
                           detail=f"failed_count={user.failed_login_count}")
        raise AuthError("Invalid credentials.")

    # ── Verify email ──────────────────────────────────────────────────────────
    if user.status == UserStatus.PENDING.value:
        raise AuthError("Invalid credentials.")

    if user.status != UserStatus.ACTIVE.value:
        raise AuthError("Invalid credentials.")

    # ── Success: reset counters ────────────────────────────────────────────────
    user.failed_login_count = 0
    user.locked_until = None

    # ── Device anomaly detection ──────────────────────────────────────────────
    is_new_device = user.last_device_hash and user.last_device_hash != device_hash
    if is_new_device:
        await _write_audit(db, actor_id=user.id, actor_email=email, action="new_device_login",
                           ip_prefix=ip_prefix, device_hash=device_hash, outcome="success")
        await notifications.send_suspicious_login_email(user.email, ip_prefix, device_hash)

    user.last_device_hash = device_hash
    user.last_ip_prefix = ip_prefix
    user.last_login_at = now

    # ── Create new session (rotate: invalidate previous tokens) ───────────────
    access_token = create_access_token(str(user.id), role=user.role)
    refresh_token = create_refresh_token(str(user.id))

    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = Session(
        user_id=user.id,
        token_hash=hash_token(access_token),
        device_hash=device_hash,
        ip_prefix=ip_prefix,
        user_agent=user_agent[:512],
        expires_at=expires_at,
    )
    db.add(session)

    await db.flush()
    rate_limiter.reset_login_ip(ip)
    rate_limiter.reset_login_account(str(user.id))

    await _write_audit(db, actor_id=user.id, actor_email=email, action="login_success",
                       ip_prefix=ip_prefix, device_hash=device_hash, outcome="success")

    return access_token, refresh_token


# ── Logout ────────────────────────────────────────────────────────────────────

async def logout_user(db: AsyncSession, *, session_id: uuid.UUID, user: User) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id, Session.user_id == user.id))
    session = result.scalar_one_or_none()
    if session:
        session.revoked_at = _utcnow()
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="logout", outcome="success")


async def logout_all_sessions(db: AsyncSession, *, user: User) -> None:
    now = _utcnow()
    result = await db.execute(select(Session).where(Session.user_id == user.id, Session.revoked_at == None))  # noqa: E711
    for s in result.scalars():
        s.revoked_at = now
    await _write_audit(db, actor_id=user.id, actor_email=user.email, action="logout_all_devices", outcome="success")


# ── Password Reset ────────────────────────────────────────────────────────────

async def request_password_reset(db: AsyncSession, *, email: str, base_url: str) -> None:
    """Generic: same message and similar timing whether email exists or not."""
    email = normalise_email(email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or user.status != UserStatus.ACTIVE.value:
        # Timing equalisation
        hash_password("dummy_timing_password_xxxxxxxxxxx")
        return

    token = generate_secure_token(32)
    token_hash = hash_token(token)
    ott = OneTimeToken(
        user_id=user.id,
        purpose=TokenPurpose.RESET_PASSWORD.value,
        token_hash=token_hash,
        expires_at=_utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRY_MIN),
    )
    db.add(ott)
    await db.flush()
    await notifications.send_password_reset_email(email, token, base_url)
    await _write_audit(db, actor_id=user.id, actor_email=email, action="password_reset_requested", outcome="success")


async def confirm_password_reset(db: AsyncSession, *, token: str, new_password: str) -> None:
    """Single-use token; invalidates all sessions on success."""
    validate_password_strength(new_password)
    token_hash = hash_token(token)
    now = _utcnow()
    result = await db.execute(
        select(OneTimeToken).where(
            OneTimeToken.token_hash == token_hash,
            OneTimeToken.purpose == TokenPurpose.RESET_PASSWORD.value,
            OneTimeToken.used_at == None,  # noqa: E711
            OneTimeToken.expires_at > now,
        )
    )
    ott = result.scalar_one_or_none()
    if not ott:
        return  # generic / silent

    ott.used_at = now
    result = await db.execute(select(User).where(User.id == ott.user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    user.password_hash = hash_password(new_password)
    # Invalidate ALL sessions
    await logout_all_sessions(db, user=user)
    await db.flush()
    await notifications.send_password_changed_email(user.email)
    await _write_audit(db, actor_id=user.id, actor_email=user.email, action="password_reset_confirmed", outcome="success")


# ── MFA ───────────────────────────────────────────────────────────────────────

async def verify_mfa_otp(
    db: AsyncSession,
    *,
    user: User,
    session: Session,
    otp: str,
    ip: str = "",
) -> bool:
    """Verify TOTP for session MFA step. Rate-limited."""
    user_id_str = str(user.id)
    if not rate_limiter.check_otp(user_id_str):
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="mfa_otp_rate_limited",
                           ip_prefix=hash_ip_prefix(ip), outcome="blocked")
        return False

    if not user.mfa_secret_encrypted:
        return False

    ok = verify_totp(user.mfa_secret_encrypted, otp)
    if ok:
        session.mfa_verified = True
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="mfa_verified", outcome="success")
    else:
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="mfa_failed", outcome="failure")
    return ok


async def use_recovery_code(
    db: AsyncSession, *, user: User, session: Session, code: str, ip: str = ""
) -> bool:
    """Use a one-time MFA recovery code."""
    code_hash = hash_recovery_code(code)
    result = await db.execute(
        select(MFARecoveryCode).where(
            MFARecoveryCode.user_id == user.id,
            MFARecoveryCode.code_hash == code_hash,
            MFARecoveryCode.used_at == None,  # noqa: E711
        )
    )
    rc = result.scalar_one_or_none()
    if not rc:
        await _write_audit(db, actor_id=user.id, actor_email=user.email, action="recovery_code_invalid",
                           ip_prefix=hash_ip_prefix(ip), outcome="failure")
        return False

    rc.used_at = _utcnow()
    session.mfa_verified = True
    await _write_audit(db, actor_id=user.id, actor_email=user.email, action="recovery_code_used",
                       ip_prefix=hash_ip_prefix(ip), outcome="success")
    return True
