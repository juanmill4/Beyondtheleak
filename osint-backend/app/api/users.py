import bcrypt
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.db_models import User
from app.api.auth import decode_token

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    role: str = "user"
    organization: str = ""


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    organization: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: str
    organization: str
    created_at: str


def require_admin(authorization: str):
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    payload = decode_token(token)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


@router.get("")
async def list_users(authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    require_admin(authorization)
    stmt = select(User).order_by(User.id)
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [
        UserOut(
            id=u.id,
            username=u.username,
            display_name=u.display_name,
            role=u.role,
            organization=u.organization or "",
            created_at=u.created_at.isoformat() if u.created_at else "",
        )
        for u in users
    ]


@router.post("")
async def create_user(req: UserCreate, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    require_admin(authorization)

    # Check uniqueness
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(username=req.username, display_name=req.display_name, password_hash=hashed, role=req.role, organization=req.organization)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role, "organization": user.organization or ""}


@router.put("/{user_id}")
async def update_user(user_id: int, req: UserUpdate, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    require_admin(authorization)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.display_name is not None:
        user.display_name = req.display_name
    if req.password is not None:
        user.password_hash = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    if req.role is not None:
        user.role = req.role
    if req.organization is not None:
        user.organization = req.organization

    await db.commit()
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role, "organization": user.organization or ""}


@router.delete("/{user_id}")
async def delete_user(user_id: int, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    require_admin(authorization)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"ok": True}
