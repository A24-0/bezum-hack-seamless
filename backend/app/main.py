import subprocess
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, AsyncSessionLocal
from app.models import Base


async def run_migrations():
    try:
        subprocess.run(["alembic", "upgrade", "head"], check=True, capture_output=True)
    except Exception as e:
        print(f"Migration warning: {e}")


async def seed_demo_data():
    """Insert demo data if DB is empty."""
    from sqlalchemy import select, text
    from app.models.user import User, ProjectMember, UserRole, ProjectMemberRole
    from app.models.project import Project, ProjectStatus
    from app.models.epoch import Epoch, EpochStatus
    from app.models.task import Task, TaskStatus, TaskLabel
    from app.models.document import Document, DocumentVisibility, DocumentStatus
    from app.models.meeting import Meeting, MeetingParticipant, MeetingTimeProposal, MeetingStatus
    from app.models.cicd import PullRequest, PRStatus
    from app.services.auth import hash_password
    from datetime import date, datetime, timedelta, timezone

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).limit(1))
        if existing.scalar_one_or_none():
            return

        # Users
        manager = User(email="manager@demo.com", name="Alice Manager", role=UserRole.manager, hashed_password=hash_password("password"), is_active=True)
        dev = User(email="dev@demo.com", name="Bob Developer", role=UserRole.developer, hashed_password=hash_password("password"), is_active=True)
        customer = User(email="client@demo.com", name="Carol Client", role=UserRole.customer, hashed_password=hash_password("password"), is_active=True)
        db.add_all([manager, dev, customer])
        await db.flush()

        # Project
        project = Project(name="E-Commerce Platform", description="Build a modern e-commerce platform with microservices architecture", status=ProjectStatus.active, gitlab_repo_url="https://gitlab.com/demo/ecommerce")
        db.add(project)
        await db.flush()

        # Members
        db.add(ProjectMember(project_id=project.id, user_id=manager.id, role=ProjectMemberRole.manager))
        db.add(ProjectMember(project_id=project.id, user_id=dev.id, role=ProjectMemberRole.developer))
        db.add(ProjectMember(project_id=project.id, user_id=customer.id, role=ProjectMemberRole.customer))
        await db.flush()

        # Epochs
        epoch1 = Epoch(project_id=project.id, name="Sprint 1: Foundation", goals="Set up project infrastructure, authentication, and basic API structure", start_date=date.today() - timedelta(days=14), end_date=date.today() + timedelta(days=7), status=EpochStatus.active, order_index=1)
        epoch2 = Epoch(project_id=project.id, name="Sprint 2: Core Features", goals="Implement product catalog, shopping cart, and checkout flow", start_date=date.today() + timedelta(days=8), end_date=date.today() + timedelta(days=28), status=EpochStatus.planning, order_index=2)
        db.add_all([epoch1, epoch2])
        await db.flush()

        # Tasks
        t1 = Task(project_id=project.id, epoch_id=epoch1.id, title="Setup CI/CD pipeline", description="Configure GitLab CI/CD with staging and production environments", status=TaskStatus.done, reporter_id=manager.id, assignee_id=dev.id, order_index=1)
        t2 = Task(project_id=project.id, epoch_id=epoch1.id, title="Implement JWT authentication", description="Build user registration, login, and token refresh endpoints", status=TaskStatus.in_progress, reporter_id=manager.id, assignee_id=dev.id, due_date=datetime.now(timezone.utc) + timedelta(days=3), order_index=2)
        t3 = Task(project_id=project.id, epoch_id=epoch1.id, title="Design database schema", description="Create ERD and initial migrations for all core entities", status=TaskStatus.review, reporter_id=manager.id, assignee_id=dev.id, order_index=3)
        t4 = Task(project_id=project.id, epoch_id=epoch1.id, title="Write API documentation", description="Document all REST endpoints using OpenAPI spec", status=TaskStatus.todo, reporter_id=manager.id, order_index=4)
        t5 = Task(project_id=project.id, epoch_id=epoch1.id, title="Review business requirements", description="Clarify scope with client, get sign-off on MVP features", status=TaskStatus.needs_info, reporter_id=manager.id, assignee_id=manager.id, order_index=5)
        db.add_all([t1, t2, t3, t4, t5])
        await db.flush()

        # Labels
        db.add(TaskLabel(task_id=t2.id, label="backend", color="#6366f1"))
        db.add(TaskLabel(task_id=t2.id, label="auth", color="#f59e0b"))
        db.add(TaskLabel(task_id=t3.id, label="database", color="#10b981"))
        await db.flush()

        # Documents
        doc1 = Document(
            project_id=project.id, epoch_id=epoch1.id, title="Business Requirements Document",
            content={"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Business Requirements"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "This document outlines the core business requirements for the e-commerce platform. The platform should support #2 authentication and #3 database operations."}]}]},
            visibility=DocumentVisibility.public, status=DocumentStatus.approved, created_by_id=manager.id, current_version=2
        )
        doc2 = Document(
            project_id=project.id, epoch_id=epoch1.id, title="Technical Architecture",
            content={"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Technical Architecture"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Microservices-based architecture using FastAPI for backend and React for frontend."}]}]},
            visibility=DocumentVisibility.managers_devs, status=DocumentStatus.draft, created_by_id=dev.id, current_version=1
        )
        doc3 = Document(
            project_id=project.id, title="Contract & Legal",
            content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Confidential contract details..."}]}]},
            visibility=DocumentVisibility.managers_only, status=DocumentStatus.approved, created_by_id=manager.id, current_version=1
        )
        db.add_all([doc1, doc2, doc3])
        await db.flush()

        # Meeting
        meeting = Meeting(
            project_id=project.id, epoch_id=epoch1.id, task_id=t2.id,
            title="Sprint Planning Meeting", description="Discuss sprint goals and task assignments",
            status=MeetingStatus.completed,
            scheduled_at=datetime.now(timezone.utc) - timedelta(days=7),
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=manager.id,
            transcript="Alice: Let's discuss the authentication task.\nBob: I'll implement JWT with refresh tokens.\nAlice: Agreed, that's decided. Bob will implement JWT auth by end of week.\nBob: I need to review the database schema first, will assign myself to that too.",
            summary="**Key Decisions**\n• Bob will implement JWT authentication\n• Database schema review needed first\n\n**Action Items**\n• Bob: implement JWT by end of week\n• Bob: review and finalize database schema\n\n**Discussion Summary**\nTeam discussed sprint priorities and task assignments for the authentication module.",
        )
        db.add(meeting)
        await db.flush()
        db.add(MeetingParticipant(meeting_id=meeting.id, user_id=manager.id, status="accepted"))
        db.add(MeetingParticipant(meeting_id=meeting.id, user_id=dev.id, status="accepted"))
        await db.flush()

        # PR
        pr = PullRequest(
            project_id=project.id, task_id=t3.id,
            gitlab_pr_id=42, title="feat: add database migrations",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/42",
            source_branch="feature/3-database-schema",
            target_branch="main",
            status=PRStatus.open,
            author_id=dev.id,
        )
        db.add(pr)
        await db.flush()

        await db.commit()
        print("✅ Demo data seeded successfully")
        print("  manager@demo.com / password")
        print("  dev@demo.com / password")
        print("  client@demo.com / password")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
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
