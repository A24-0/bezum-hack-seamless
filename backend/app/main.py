import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


async def run_migrations():
    try:
        subprocess.run(["alembic", "upgrade", "head"], check=True, capture_output=True)
    except Exception as e:
        print(f"Migration warning: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
    if settings.SEED_DEMO_DATA:
        from app.seed_demo import seed_demo_data

        await seed_demo_data()
    yield


app = FastAPI(title="Seamless API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import auth, users, projects, epochs, tasks, documents, meetings, cicd, notifications, websocket

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(epochs.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(meetings.router, prefix="/api")
app.include_router(cicd.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Seamless API"}
