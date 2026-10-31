# ==============================================================================
# PIPELINE / MODEL COMPONENT: CAPTCHA Adapter
# TECH STACK: Python / FastAPI — pluggable: stub (dev), Cloudflare Turnstile
# ==============================================================================
from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class CaptchaAdapter(ABC):
    @abstractmethod
    async def verify(self, token: str, remote_ip: str) -> bool:
        """Verify a CAPTCHA token. Returns True if valid."""


class StubCaptchaAdapter(CaptchaAdapter):
    """Dev/test stub: any non-empty token passes; empty token fails."""
    async def verify(self, token: str, remote_ip: str) -> bool:
        result = bool(token and token != "FAIL")
        logger.info("captcha_stub_verify", result=result)
        return result


class TurnstileCaptchaAdapter(CaptchaAdapter):
    """Cloudflare Turnstile verification."""
    VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

    async def verify(self, token: str, remote_ip: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    self.VERIFY_URL,
                    data={
                        "secret": settings.CAPTCHA_SECRET_KEY,
                        "response": token,
                        "remoteip": remote_ip,
                    },
                )
                data = resp.json()
                return bool(data.get("success"))
        except Exception as exc:
            logger.warning("captcha_turnstile_error", error=str(exc))
            return False


class HCaptchaAdapter(CaptchaAdapter):
    """hCaptcha verification."""
    VERIFY_URL = "https://hcaptcha.com/siteverify"

    async def verify(self, token: str, remote_ip: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    self.VERIFY_URL,
                    data={
                        "secret": settings.CAPTCHA_SECRET_KEY,
                        "response": token,
                        "remoteip": remote_ip,
                    },
                )
                data = resp.json()
                return bool(data.get("success"))
        except Exception as exc:
            logger.warning("captcha_hcaptcha_error", error=str(exc))
            return False


def get_captcha_adapter() -> CaptchaAdapter:
    provider = settings.CAPTCHA_PROVIDER
    if provider == "turnstile":
        return TurnstileCaptchaAdapter()
    elif provider == "hcaptcha":
        return HCaptchaAdapter()
    return StubCaptchaAdapter()
