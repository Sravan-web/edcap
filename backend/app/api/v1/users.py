from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import CurrentUser, RequireAdmin
from app.core.database import get_db
from app.models.user import User, UserStatus

router = APIRouter(prefix="/users", tags=["users"])


class UserProfileResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    theme: str
    font_preference: str

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    theme: str | None = Field(None, pattern="^(dark|light)$")
    font_preference: str | None = Field(None, max_length=30)


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: CurrentUser):
    return UserProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        role=current_user.role,
        theme=current_user.theme,
        font_preference=current_user.font_preference,
    )


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(body: UpdateProfileRequest, current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    if body.first_name is not None:
        current_user.first_name = body.first_name
    if body.last_name is not None:
        current_user.last_name = body.last_name
    if body.theme is not None:
        current_user.theme = body.theme
    if body.font_preference is not None:
        current_user.font_preference = body.font_preference
    await db.flush()
    return UserProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        role=current_user.role,
        theme=current_user.theme,
        font_preference=current_user.font_preference,
    )


@router.get("/me/sessions")
async def list_sessions(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    from app.models.user import Session
    result = await db.execute(
        select(Session).where(Session.user_id == current_user.id, Session.revoked_at == None)  # noqa
    )
    sessions = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "device_hash": s.device_hash,
            "ip_prefix": s.ip_prefix,
            "created_at": s.created_at.isoformat(),
            "last_seen_at": s.last_seen_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
        }
        for s in sessions
    ]


@router.delete("/me/sessions", status_code=200)
async def revoke_all_sessions(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    from app.services.auth_service import logout_all_sessions
    await logout_all_sessions(db, user=current_user)
    return {"message": "All sessions have been terminated."}
