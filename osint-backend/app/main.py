import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import select

from app.api.endpoints import router as api_router
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.projects import router as projects_router
from app.core.database import init_db, async_session
from app.models.db_models import User


async def seed_demo_accounts():
    """Create demo admin and user accounts if they don't exist."""
    async with async_session() as db:
        # Check if admin exists
        result = await db.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin_hash = bcrypt.hashpw("admin123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            db.add(User(username="admin", display_name="Administrator", password_hash=admin_hash, role="admin"))

        # Check if demo exists
        result = await db.execute(select(User).where(User.username == "demo"))
        if not result.scalar_one_or_none():
            demo_hash = bcrypt.hashpw("demo123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            db.add(User(username="demo", display_name="Demo User", password_hash=demo_hash, role="user"))

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await seed_demo_accounts()
    print("[DarkEye] Database initialized and demo accounts seeded.")
    yield
    # Shutdown


app = FastAPI(
    title="OSINT Stateless Backend",
    description="Backend API for asynchronous OSINT profile analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the frontend application to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to visualizador domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"message": "OSINT API is running. Use /docs for Swagger UI."}
