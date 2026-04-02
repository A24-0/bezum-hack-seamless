import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

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
    allow_origins=[o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[h.strip() for h in settings.CORS_ALLOW_HEADERS.split(",") if h.strip()],
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: Response = await call_next(request)
        # Common hardening headers (safe for this app).
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        # Prevent browsers from sniffing/using cached sensitive responses.
        response.headers.setdefault("Cache-Control", "no-store")
        return response


app.add_middleware(SecurityHeadersMiddleware)

from app.routers import admin, auth, users, projects, epochs, tasks, documents, meetings, cicd, notifications, websocket, cabinet, ai

app.include_router(admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(epochs.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(meetings.router, prefix="/api")
app.include_router(cicd.router, prefix="/api")
app.include_router(cabinet.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Seamless API"}
