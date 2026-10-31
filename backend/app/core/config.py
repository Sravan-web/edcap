# ==============================================================================
# PIPELINE / MODEL COMPONENT: Application Configuration
# TECH STACK: Python / FastAPI / Pydantic-Settings
# ==============================================================================
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "EdCap"
    ENVIRONMENT: Literal["development", "testing", "production"] = "development"
    DEBUG: bool = False
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_32_RANDOM_BYTES"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = f"sqlite+aiosqlite:///{BACKEND_DIR / 'edcap.db'}"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # ── Auth / JWT ───────────────────────────────────────────────────────────
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SESSION_IDLE_TIMEOUT_MIN: int = 30
    SESSION_ABS_TIMEOUT_H: int = 8

    # ── Login Protection ─────────────────────────────────────────────────────
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_RATE_WINDOW_MINUTES: int = 15
    LOGIN_LOCKOUT_MINUTES: int = 15
    CAPTCHA_TRIGGER_AFTER: int = 3  # trigger captcha after N failures
    CAPTCHA_PROVIDER: Literal["stub", "turnstile", "hcaptcha", "recaptcha"] = "stub"
    CAPTCHA_SECRET_KEY: str = ""
    CAPTCHA_SITE_KEY: str = ""

    # ── MFA ──────────────────────────────────────────────────────────────────
    MFA_SECRET_ENCRYPTION_KEY: str = "CHANGE_ME_32_BYTES_BASE64_ENCODED"
    MFA_OTP_RATE_LIMIT: int = 5  # per minute
    MFA_STEPUP_VALID_MINUTES: int = 30
    MFA_RECOVERY_CODE_COUNT: int = 10

    # ── Password Policy ──────────────────────────────────────────────────────
    PASSWORD_MIN_LENGTH: int = 12

    # ── Email ────────────────────────────────────────────────────────────────
    EMAIL_PROVIDER: Literal["console", "smtp"] = "console"
    EMAIL_FROM: str = "noreply@edcap.demo"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True

    # ── Token Expiry ─────────────────────────────────────────────────────────
    EMAIL_VERIFY_EXPIRY_H: int = 24
    RESET_TOKEN_EXPIRY_MIN: int = 30

    # ── Upload Limits ────────────────────────────────────────────────────────
    UPLOAD_MAX_CSV_MB: int = 5
    UPLOAD_MAX_MODULE_MB: int = 20
    UPLOAD_STORAGE_PATH: str = "uploads"  # relative to backend root, not web-root

    # ── Rule Engine ──────────────────────────────────────────────────────────
    RULE_BELOW_AVG_PCT: float = 15.0
    RULE_BELOW_AVG_WINDOW: int = 5
    RULE_BELOW_AVG_MIN_FIRES: int = 3
    RULE_TREND_SLOPE: float = -2.0
    RULE_TREND_MIN_ASSESSMENTS: int = 4
    RULE_TOPIC_ACCURACY_PCT: float = 50.0
    RULE_TOPIC_MIN_ATTEMPTS: int = 5

    # ── Quiz ─────────────────────────────────────────────────────────────────
    QUIZ_QUESTIONS_PER_DAY: int = 20
    QUIZ_MIX_CORE: int = 12
    QUIZ_MIX_APPLICATION: int = 5
    QUIZ_MIX_PREREQ: int = 3
    LLM_MAX_RETRIES: int = 2

    # ── LLM ──────────────────────────────────────────────────────────────────
    LLM_PROVIDER: Literal["openai", "offline"] = "offline"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TIMEOUT_S: int = 30

    # ── Telemetry ────────────────────────────────────────────────────────────
    TELEMETRY_FLUSH_INTERVAL_S: int = 5
    TELEMETRY_RATE_LIMIT_PER_MINUTE: int = 300

    # ── Spaced Repetition ────────────────────────────────────────────────────
    SR_INTERVALS_DAYS: list[int] = [1, 3, 7, 14]

    # ── Data Retention ───────────────────────────────────────────────────────
    DATA_RETENTION_DAYS: int = 365

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    GLOBAL_RATE_LIMIT: str = "200/minute"
    REQUEST_MAX_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB global cap

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def resolve_sqlite_path(cls, v: object) -> object:
        if isinstance(v, str) and v.startswith("sqlite+aiosqlite:///./"):
            rel_name = v.replace("sqlite+aiosqlite:///./", "", 1)
            return f"sqlite+aiosqlite:///{BACKEND_DIR / rel_name}"
        return v

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v  # type: ignore[return-value]

    @field_validator("SR_INTERVALS_DAYS", mode="before")
    @classmethod
    def parse_intervals(cls, v: object) -> list[int]:
        if isinstance(v, str):
            return [int(x.strip()) for x in v.split(",")]
        return v  # type: ignore[return-value]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def upload_max_csv_bytes(self) -> int:
        return self.UPLOAD_MAX_CSV_MB * 1024 * 1024

    @property
    def upload_max_module_bytes(self) -> int:
        return self.UPLOAD_MAX_MODULE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
