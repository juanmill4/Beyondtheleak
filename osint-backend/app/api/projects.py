import datetime
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, or_, func, String
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.db_models import Project
from app.api.auth import decode_token

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    graph_data: Optional[dict] = None
    primary_nodes_count: int = 0
    superusers_count: int = 0
    total_nodes_count: int = 0


class ProjectOverwrite(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    graph_data: Optional[dict] = None
    primary_nodes_count: Optional[int] = None
    superusers_count: Optional[int] = None
    total_nodes_count: Optional[int] = None


def get_user_from_header(authorization: str):
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_token(token)


@router.get("")
async def list_projects(
    authorization: str = Header(""),
    search: str = Query("", description="Search by name, description or date"),
    db: AsyncSession = Depends(get_db),
):
    from app.models.db_models import User
    user = get_user_from_header(authorization)
    
    # Base query joining User to get username and organization
    stmt = select(Project, User).join(User, Project.user_id == User.id)
    
    # Admin sees all, Regular user sees only theirs
    if user["role"] != "admin":
        stmt = stmt.where(Project.user_id == user["user_id"])

    if search:
        search_like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Project.name.ilike(search_like),
                Project.description.ilike(search_like),
                func.cast(Project.created_at, String).ilike(search_like),
                User.username.ilike(search_like),
                User.organization.ilike(search_like)
            )
        )

    stmt = stmt.order_by(Project.updated_at.desc())
    result = await db.execute(stmt)
    
    response = []
    for p, u in result.all():
        response.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "version": p.version,
            "primary_nodes_count": p.primary_nodes_count,
            "superusers_count": p.superusers_count,
            "total_nodes_count": p.total_nodes_count,
            "created_at": p.created_at.isoformat() if p.created_at else "",
            "updated_at": p.updated_at.isoformat() if p.updated_at else "",
            "user": {
                "username": u.username,
                "organization": u.organization or ""
            }
        })
        
    return response


@router.post("")
async def create_project(req: ProjectCreate, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    user = get_user_from_header(authorization)
    project = Project(
        user_id=user["user_id"],
        name=req.name,
        description=req.description,
        version=1,
        primary_nodes_count=req.primary_nodes_count,
        superusers_count=req.superusers_count,
        total_nodes_count=req.total_nodes_count,
        graph_data=req.graph_data,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {
        "id": project.id,
        "name": project.name,
        "version": project.version,
        "created_at": project.created_at.isoformat() if project.created_at else "",
    }


@router.put("/{project_id}")
async def overwrite_project(
    project_id: int, req: ProjectOverwrite, authorization: str = Header(""), db: AsyncSession = Depends(get_db)
):
    user = get_user_from_header(authorization)
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user["user_id"]))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if req.name is not None:
        project.name = req.name
    if req.description is not None:
        project.description = req.description
    if req.graph_data is not None:
        project.graph_data = req.graph_data
    if req.primary_nodes_count is not None:
        project.primary_nodes_count = req.primary_nodes_count
    if req.superusers_count is not None:
        project.superusers_count = req.superusers_count
    if req.total_nodes_count is not None:
        project.total_nodes_count = req.total_nodes_count
    project.updated_at = datetime.datetime.utcnow()

    await db.commit()
    return {"id": project.id, "name": project.name, "version": project.version}


@router.post("/{project_id}/version")
async def new_version(project_id: int, req: ProjectOverwrite, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    user = get_user_from_header(authorization)
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user["user_id"]))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find the max version for this name
    max_ver_result = await db.execute(
        select(func.max(Project.version)).where(Project.user_id == user["user_id"], Project.name == original.name)
    )
    max_ver = max_ver_result.scalar() or original.version

    new_project = Project(
        user_id=user["user_id"],
        name=req.name or original.name,
        description=req.description if req.description is not None else original.description,
        version=max_ver + 1,
        primary_nodes_count=req.primary_nodes_count if req.primary_nodes_count is not None else original.primary_nodes_count,
        superusers_count=req.superusers_count if req.superusers_count is not None else original.superusers_count,
        total_nodes_count=req.total_nodes_count if req.total_nodes_count is not None else original.total_nodes_count,
        graph_data=req.graph_data if req.graph_data is not None else original.graph_data,
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    return {"id": new_project.id, "name": new_project.name, "version": new_project.version}


@router.get("/{project_id}")
async def get_project(project_id: int, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    user = get_user_from_header(authorization)
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user["user_id"]))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "version": project.version,
        "primary_nodes_count": project.primary_nodes_count,
        "superusers_count": project.superusers_count,
        "total_nodes_count": project.total_nodes_count,
        "graph_data": project.graph_data,
        "created_at": project.created_at.isoformat() if project.created_at else "",
        "updated_at": project.updated_at.isoformat() if project.updated_at else "",
    }


@router.delete("/{project_id}")
async def delete_project(project_id: int, authorization: str = Header(""), db: AsyncSession = Depends(get_db)):
    user = get_user_from_header(authorization)
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user["user_id"]))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
    return {"ok": True}
