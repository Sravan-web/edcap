# ==============================================================================
# PIPELINE / MODEL COMPONENT: Tests — Configuration
# TECH STACK: Python / pytest / pytest-asyncio
# ==============================================================================
from __future__ import annotations

import asyncio
import os

import pytest
import pytest_asyncio

# Use in-memory SQLite for tests
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENVIRONMENT", "testing")
os.environ.setdefault("SECRET_KEY", "test_secret_key_32_bytes_minimum!")
os.environ.setdefault("MFA_SECRET_ENCRYPTION_KEY", "dGVzdF9lbmNyeXB0aW9uX2tleV8zMg==")
os.environ.setdefault("EMAIL_PROVIDER", "console")
os.environ.setdefault("LLM_PROVIDER", "offline")


@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()
