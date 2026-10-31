# ==============================================================================
# PIPELINE / MODEL COMPONENT: Tests — Auth Endpoints
# TECH STACK: Python / pytest / httpx / FastAPI
# ==============================================================================
"""
Integration tests for the Auth API (/api/v1/auth/*).

Run with:
    cd backend
    pytest tests/ -v
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Signup ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_signup_returns_202(client: AsyncClient):
    resp = await client.post("/api/v1/auth/signup", json={
        "email": "test_signup@example.com",
        "password": "SecurePass1234!",
        "first_name": "Test",
        "last_name": "User",
    })
    assert resp.status_code == 202
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_signup_weak_password_rejected(client: AsyncClient):
    resp = await client.post("/api/v1/auth/signup", json={
        "email": "test2@example.com",
        "password": "short",
        "first_name": "A",
        "last_name": "B",
    })
    assert resp.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_signup_duplicate_email_is_silent(client: AsyncClient):
    """Duplicate signup should not reveal whether email exists."""
    payload = {
        "email": "dup@example.com",
        "password": "SecurePass1234!",
        "first_name": "Dup",
        "last_name": "User",
    }
    r1 = await client.post("/api/v1/auth/signup", json=payload)
    r2 = await client.post("/api/v1/auth/signup", json=payload)
    # Both should return 202 (or 202/200) — no user enumeration
    assert r1.status_code in (202, 200)
    assert r2.status_code in (202, 200)


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_unverified_returns_401(client: AsyncClient):
    """Attempt to login before email verification should fail."""
    await client.post("/api/v1/auth/signup", json={
        "email": "unverified@example.com",
        "password": "SecurePass1234!",
        "first_name": "Un",
        "last_name": "Verified",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "unverified@example.com",
        "password": "SecurePass1234!",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "nobody@example.com",
        "password": "WrongPassword1234!",
    })
    assert resp.status_code == 401


# ── Password Reset ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_password_reset_request_always_202(client: AsyncClient):
    """Should always return 202 regardless of whether email exists."""
    resp = await client.post("/api/v1/auth/password-reset/request", json={
        "email": "nonexistent@example.com"
    })
    assert resp.status_code == 202
    assert "message" in resp.json()


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_healthz(client: AsyncClient):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "app" in data


# ── Protected Routes ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401
