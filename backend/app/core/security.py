# ==============================================================================
# PIPELINE / MODEL COMPONENT: Security Utilities
# TECH STACK: Python / Argon2id / python-jose / pyotp / cryptography
# ==============================================================================
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from cryptography.fernet import Fernet
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()

_ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

# Fernet key derived from MFA_SECRET_ENCRYPTION_KEY (must be 32-byte url-safe base64)
def _get_fernet() -> Fernet:
    raw = settings.MFA_SECRET_ENCRYPTION_KEY.encode()
    # Derive a 32-byte key if the provided key is not already valid Fernet key
    key_bytes = hashlib.sha256(raw).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


# ── Password ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def dummy_password_verify() -> None:
    """Run a dummy hash verification to equalise timing on unknown emails."""
    _ph.hash("dummy_timing_equalisation_password_xxxx")


# ── Tokens ────────────────────────────────────────────────────────────────────

def generate_secure_token(n_bytes: int = 32) -> str:
    """Generate a URL-safe cryptographically random token."""
    return secrets.token_urlsafe(n_bytes)


def hash_token(token: str) -> str:
    """SHA-256 hash a token for storage (one-way)."""
    return hashlib.sha256(token.encode()).hexdigest()


def secure_compare(a: str, b: str) -> bool:
    """Constant-time string comparison."""
    return hmac.compare_digest(a, b)


# ── JWT ───────────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"


def create_access_token(
    subject: str,
    role: str,
    extra: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": expire,
        "type": "access",
        **(extra or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT; raise JWTError on any failure."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


# ── MFA Secret Encryption ─────────────────────────────────────────────────────

def encrypt_totp_secret(secret: str) -> str:
    return _get_fernet().encrypt(secret.encode()).decode()


def decrypt_totp_secret(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ── Device Fingerprinting ─────────────────────────────────────────────────────

def hash_device(user_agent: str, accept_language: str = "") -> str:
    """Create a pseudonymous device fingerprint hash."""
    raw = f"{user_agent}|{accept_language}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def hash_ip_prefix(ip: str) -> str:
    """Store only the first two octets of an IPv4 or first two groups of IPv6."""
    parts = ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:2]) + ".x.x"
    # IPv6: take first two groups
    v6parts = ip.split(":")
    return ":".join(v6parts[:2]) + ":..."
