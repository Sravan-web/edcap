# ==============================================================================
# PIPELINE / MODEL COMPONENT: Structured JSON Logging
# TECH STACK: Python / structlog
# ==============================================================================
from __future__ import annotations

import logging
import sys

import structlog
from structlog.types import EventDict, WrappedLogger

# Fields that must never appear in logs
_REDACTED_FIELDS = frozenset(
    {
        "password",
        "password_hash",
        "token",
        "access_token",
        "refresh_token",
        "otp",
        "totp",
        "secret",
        "mfa_secret",
        "code",
        "recovery_code",
        "card_number",
    }
)
_REDACTED_SENTINEL = "[REDACTED]"


def _redact_sensitive(
    logger: WrappedLogger, method: str, event_dict: EventDict
) -> EventDict:
    """Remove sensitive fields from log events before emission."""
    for field in list(event_dict.keys()):
        if field.lower() in _REDACTED_FIELDS:
            event_dict[field] = _REDACTED_SENTINEL
    return event_dict


def configure_logging(log_level: str = "INFO") -> None:
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        _redact_sensitive,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
    ]

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
