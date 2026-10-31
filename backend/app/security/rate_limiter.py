# ==============================================================================
# PIPELINE / MODEL COMPONENT: Rate Limiter — Login, OTP, Telemetry
# TECH STACK: Python / slowapi / limits (in-memory for dev; Redis for prod)
# ==============================================================================
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class InMemoryRateLimiter:
    """
    Thread-safe sliding-window rate limiter.
    Keyed on arbitrary strings (e.g., IP address, account ID, or combined).
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self._max = max_requests
        self._window = window_seconds
        self._windows: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def is_allowed(self, key: str) -> bool:
        """Return True if the request is within limits, False if rate-limited."""
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            dq = self._windows[key]
            # Remove stale entries
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self._max:
                return False
            dq.append(now)
            return True

    def get_remaining(self, key: str) -> int:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            dq = self._windows[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            return max(0, self._max - len(dq))

    def reset(self, key: str) -> None:
        with self._lock:
            self._windows.pop(key, None)


# Singleton rate limiters
_login_ip_limiter = InMemoryRateLimiter(
    max_requests=settings.LOGIN_MAX_ATTEMPTS,
    window_seconds=settings.LOGIN_RATE_WINDOW_MINUTES * 60,
)
_login_account_limiter = InMemoryRateLimiter(
    max_requests=settings.LOGIN_MAX_ATTEMPTS,
    window_seconds=settings.LOGIN_RATE_WINDOW_MINUTES * 60,
)
_otp_limiter = InMemoryRateLimiter(
    max_requests=settings.MFA_OTP_RATE_LIMIT,
    window_seconds=60,
)


def check_login_ip(ip: str) -> bool:
    return _login_ip_limiter.is_allowed(f"login_ip:{ip}")


def check_login_account(account_id: str) -> bool:
    return _login_account_limiter.is_allowed(f"login_acct:{account_id}")


def check_otp(user_id: str) -> bool:
    return _otp_limiter.is_allowed(f"otp:{user_id}")


def reset_login_ip(ip: str) -> None:
    _login_ip_limiter.reset(f"login_ip:{ip}")


def reset_login_account(account_id: str) -> None:
    _login_account_limiter.reset(f"login_acct:{account_id}")
