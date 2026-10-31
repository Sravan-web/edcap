# ==============================================================================
# PIPELINE / MODEL COMPONENT: Auth API Routes
# TECH STACK: Python / FastAPI
# ==============================================================================
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    decrypt_totp_secret,
    encrypt_totp_secret,
    hash_token,
    generate_secure_token,
)
from app.models.user import MFARecoveryCode, Session, User, UserRole
from app.security.mfa import generate_totp_setup
from app.services import auth_service
from app.services.auth_service import AuthError, normalise_email

settings = get_settings()
logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_GENERIC_OK = {"message": "If this action is applicable, it has been completed."}

# ── Schemas ───────────────────────────────────────────────────────────────────


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    captcha_token: str | None = None


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=12, max_length=128)


class MFAVerifyRequest(BaseModel):
    otp: str = Field(min_length=6, max_length=8)


class MFARecoverRequest(BaseModel):
    code: str = Field(min_length=10, max_length=20)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    secure = settings.is_production
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
async def signup(
    body: SignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new account. Always returns the same generic message."""
    base_url = str(request.base_url).rstrip("/")
    # Replace with frontend URL in production
    frontend_url = settings.ALLOWED_ORIGINS[0] if settings.ALLOWED_ORIGINS else base_url
    try:
        await auth_service.signup_user(
            db,
            email=str(body.email),
            password=body.password,
            first_name=body.first_name,
            last_name=body.last_name,
            base_url=frontend_url,
        )
    except auth_service.PasswordError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _GENERIC_OK


@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Verify email address. Always returns a generic message."""
    await auth_service.verify_email_token(db, token=body.token)
    return _GENERIC_OK


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and set HttpOnly session cookies."""
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    accept_lang = request.headers.get("accept-language", "")

    try:
        access_token, refresh_token = await auth_service.login_user(
            db,
            email=str(body.email),
            password=body.password,
            ip=ip,
            user_agent=user_agent,
            accept_language=accept_lang,
            captcha_token=body.captcha_token,
        )
    except AuthError as e:
        captcha_needed = e.captcha_required
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"X-Captcha-Required": "true"} if captcha_needed else {},
        )

    response = JSONResponse(
        content={"message": "Authenticated.", "captcha_site_key": settings.CAPTCHA_SITE_KEY if settings.CAPTCHA_SITE_KEY else None}
    )
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    current_user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    session: Session = getattr(request.state, "session", None)
    if session:
        await auth_service.logout_user(db, session_id=session.id, user=current_user)
    response = JSONResponse(content={"message": "Logged out."})
    _clear_auth_cookies(response)
    return response


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def password_reset_request(
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Initiate password reset. Generic response; no enumeration."""
    frontend_url = settings.ALLOWED_ORIGINS[0] if settings.ALLOWED_ORIGINS else str(request.base_url)
    await auth_service.request_password_reset(db, email=str(body.email), base_url=frontend_url)
    return _GENERIC_OK


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
async def password_reset_confirm(body: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    """Complete password reset with single-use token."""
    try:
        await auth_service.confirm_password_reset(db, token=body.token, new_password=body.new_password)
    except auth_service.PasswordError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _GENERIC_OK


@router.post("/mfa/setup", status_code=status.HTTP_200_OK)
async def mfa_setup(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Generate a new TOTP secret and return the provisioning URI + recovery codes."""
    setup = generate_totp_setup(current_user.email)

    current_user.mfa_secret_encrypted = setup.encrypted_secret
    # Clear old recovery codes
    result = await db.execute(select(MFARecoveryCode).where(MFARecoveryCode.user_id == current_user.id))
    for rc in result.scalars():
        await db.delete(rc)

    for code_hash in setup.recovery_code_hashes:
        db.add(MFARecoveryCode(user_id=current_user.id, code_hash=code_hash))

    await db.flush()
    return {
        "provisioning_uri": setup.provisioning_uri,
        "recovery_codes": setup.recovery_codes,  # shown once
        "message": "Save your recovery codes in a secure location. They will not be shown again.",
    }


@router.post("/mfa/verify", status_code=status.HTTP_200_OK)
async def mfa_verify(
    body: MFAVerifyRequest,
    current_user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP OTP to complete MFA for this session."""
    session: Session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found.")

    ip = request.client.host if request.client else ""
    ok = await auth_service.verify_mfa_otp(db, user=current_user, session=session, otp=body.otp, ip=ip)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP.")

    if not current_user.mfa_enabled:
        current_user.mfa_enabled = True
        await db.flush()

    return {"message": "MFA verified."}


@router.post("/mfa/stepup", status_code=status.HTTP_200_OK)
async def mfa_stepup(
    body: MFAVerifyRequest,
    current_user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Step-up MFA verification for sensitive actions."""
    from datetime import datetime, timezone
    session: Session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found.")

    ip = request.client.host if request.client else ""
    ok = await auth_service.verify_mfa_otp(db, user=current_user, session=session, otp=body.otp, ip=ip)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid OTP.")

    session.mfa_stepped_up = True
    session.mfa_stepup_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return {"message": "Step-up MFA verified."}


@router.post("/mfa/recover", status_code=status.HTTP_200_OK)
async def mfa_recover(
    body: MFARecoverRequest,
    current_user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Use a one-time recovery code in place of TOTP."""
    session: Session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found.")

    ip = request.client.host if request.client else ""
    ok = await auth_service.use_recovery_code(db, user=current_user, session=session, code=body.code, ip=ip)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid or already-used recovery code.")
    return {"message": "Recovery code accepted. Please set up a new authenticator."}
