# ==============================================================================
# PIPELINE / MODEL COMPONENT: MFA — TOTP Setup, Verification, Recovery Codes
# TECH STACK: Python / pyotp / cryptography
# ==============================================================================
from __future__ import annotations

import secrets
import string
from typing import NamedTuple

import pyotp

from app.core.config import get_settings
from app.core.security import (
    decrypt_totp_secret,
    encrypt_totp_secret,
    hash_token,
)

settings = get_settings()


class TOTPSetup(NamedTuple):
    secret: str                    # plain TOTP secret (show to user once)
    encrypted_secret: str          # Fernet-encrypted, store in DB
    provisioning_uri: str          # otpauth:// URI for QR code
    recovery_codes: list[str]      # plain codes (show to user once)
    recovery_code_hashes: list[str]  # SHA-256 hashes, store in DB


def generate_totp_setup(email: str, app_name: str | None = None) -> TOTPSetup:
    """Generate a new TOTP secret, QR URI, and recovery codes."""
    secret = pyotp.random_base32()
    encrypted = encrypt_totp_secret(secret)
    issuer = app_name or settings.APP_NAME
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=email, issuer_name=issuer)
    codes, hashes = _generate_recovery_codes()
    return TOTPSetup(
        secret=secret,
        encrypted_secret=encrypted,
        provisioning_uri=uri,
        recovery_codes=codes,
        recovery_code_hashes=hashes,
    )


def verify_totp(encrypted_secret: str, otp: str) -> bool:
    """Verify a TOTP code against the stored (encrypted) secret."""
    try:
        secret = decrypt_totp_secret(encrypted_secret)
        totp = pyotp.TOTP(secret)
        # valid_window=1 allows one time step either side (30s tolerance)
        return totp.verify(otp, valid_window=1)
    except Exception:
        return False


def _generate_recovery_codes() -> tuple[list[str], list[str]]:
    """Generate N alphanumeric recovery codes and their SHA-256 hashes."""
    n = settings.MFA_RECOVERY_CODE_COUNT
    alphabet = string.ascii_uppercase + string.digits
    codes = []
    hashes = []
    for _ in range(n):
        # Format: XXXX-XXXX-XXXX (12 chars, grouped)
        raw = "".join(secrets.choice(alphabet) for _ in range(12))
        formatted = f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"
        codes.append(formatted)
        hashes.append(hash_token(formatted.replace("-", "")))
    return codes, hashes


def hash_recovery_code(code: str) -> str:
    """Hash a recovery code for storage/comparison (remove dashes first)."""
    return hash_token(code.replace("-", "").upper())
