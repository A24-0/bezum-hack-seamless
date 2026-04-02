import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.cicd import PRStatus, PullRequest
from app.models.document import (
    Document,
    DocumentStatus,
    DocumentTaskLink,
    DocumentTaskLinkType,
    DocumentVersion,
    DocumentVisibility,
)
from app.models.epoch import Epoch, EpochStatus
from app.models.meeting import (
    Meeting,
    MeetingParticipant,
    MeetingStatus,
    MeetingTimeProposal,
)
from app.models.notification import Notification, NotificationType
from app.models.project import Project, ProjectStatus, Release
from app.models.task import Task, TaskLabel, TaskStatus, TaskWatcher
from app.models.user import ProjectMember, ProjectMemberRole, User, UserRole, UserTech
from app.services.auth import hash_password

# Демо-проект под репозиторий хакатона (GitHub owner/repo для CI/CD и ссылок в UI)
BEZUM_SEAMLESS_REPO = "A24-0/bezum-hack-seamless"
BEZUM_SEAMLESS_NAME = "Bezum Platform (Seamless)"
BEZUM_SEAMLESS_DESC = (
    "Монорепозиторий платформы Seamless: React (Vite) + Nginx, FastAPI, PostgreSQL, один docker-compose. "
    "Репозиторий для сдачи кейса: https://github.com/A24-0/bezum-hack-seamless — здесь же демо данных для обзора, "
    "канбана, документов, CI/CD и страницы «Связи»."
)


async def _ensure_bezum_seamless_demo_bundle(
    db,
    manager: User,
    dev: User,
    customer: User,
    dev2: User,
    manager2: User,
) -> None:
    """Один проект = реальный GitHub-репо хакатона: задачи, документы, PR с кликабельными ссылками."""
    res = await db.execute(select(Project).where(Project.gitlab_repo_url == BEZUM_SEAMLESS_REPO))
    if res.scalar_one_or_none() is not None:
        return

    p = Project(
        name=BEZUM_SEAMLESS_NAME,
        description=BEZUM_SEAMLESS_DESC,
        status=ProjectStatus.active,
        gitlab_repo_url=BEZUM_SEAMLESS_REPO,
    )
    db.add(p)
    await db.flush()

    db.add_all(
        [
            ProjectMember(project_id=p.id, user_id=manager.id, role=ProjectMemberRole.manager),
            ProjectMember(project_id=p.id, user_id=dev.id, role=ProjectMemberRole.developer),
            ProjectMember(project_id=p.id, user_id=dev2.id, role=ProjectMemberRole.developer),
            ProjectMember(project_id=p.id, user_id=customer.id, role=ProjectMemberRole.customer),
            ProjectMember(project_id=p.id, user_id=manager2.id, role=ProjectMemberRole.manager),
        ]
    )
    await db.flush()

    e1 = Epoch(
        project_id=p.id,
        name="Спринт: интеграция и сдача",
        goals="Связка docs/kanban/CI/CD, демо для жюри, стабильный docker-compose",
        start_date=date.today() - timedelta(days=5),
        end_date=date.today() + timedelta(days=9),
        status=EpochStatus.active,
        order_index=1,
    )
    e2 = Epoch(
        project_id=p.id,
        name="Следующий: hardening",
        goals="Нагрузка, бэкапы, наблюдаемость",
        start_date=date.today() + timedelta(days=10),
        end_date=date.today() + timedelta(days=24),
        status=EpochStatus.planning,
        order_index=2,
    )
    db.add_all([e1, e2])
    await db.flush()

    def _doc(title: str, text: str) -> dict:
        return {
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": title}]},
                {"type": "paragraph", "content": [{"type": "text", "text": text}]},
            ],
        }

    bt1 = Task(
        project_id=p.id,
        epoch_id=e1.id,
        title="CI/CD: синхронизация PR из GitHub",
        description="Репозиторий в разделе CI/CD: A24-0/bezum-hack-seamless. Проверить webhook и ручной sync.",
        status=TaskStatus.in_progress,
        reporter_id=manager.id,
        assignee_id=dev.id,
        order_index=1,
    )
    bt2 = Task(
        project_id=p.id,
        epoch_id=e1.id,
        title="Документация сущностей и связей для кейса",
        description="Описание в README/docs: проект, эпохи, документы, задачи, встречи, PR.",
        status=TaskStatus.todo,
        reporter_id=manager.id,
        assignee_id=dev2.id,
        order_index=2,
    )
    bt3 = Task(
        project_id=p.id,
        epoch_id=e1.id,
        title="Страница «Связи»: матрица документ ↔ задача",
        description="Показать тепловую карту и переходы на канбан по #task-id.",
        status=TaskStatus.review,
        reporter_id=manager.id,
        assignee_id=dev.id,
        order_index=3,
    )
    bt4 = Task(
        project_id=p.id,
        epoch_id=e1.id,
        title="Прод: Caddy + TLS и smoke-check",
        description="docker-compose.prod.yml, DOMAIN в .env, проверка /api/health и UI.",
        status=TaskStatus.done,
        reporter_id=manager2.id,
        assignee_id=dev.id,
        order_index=4,
    )
    bt5 = Task(
        project_id=p.id,
        epoch_id=e1.id,
        title="Демо-данные и сид PostgreSQL",
        description="SEED_DEMO_DATA=true в dev; проект с реальным URL репозитория в БД.",
        status=TaskStatus.done,
        reporter_id=manager.id,
        assignee_id=dev2.id,
        order_index=5,
    )
    bt6 = Task(
        project_id=p.id,
        epoch_id=e2.id,
        title="Расширенные уведомления по упоминаниям",
        status=TaskStatus.backlog,
        reporter_id=manager.id,
        assignee_id=dev.id,
        order_index=6,
    )
    db.add_all([bt1, bt2, bt3, bt4, bt5, bt6])
    await db.flush()

    db.add_all(
        [
            TaskLabel(task_id=bt1.id, label="github", color="#6366f1"),
            TaskLabel(task_id=bt1.id, label="cicd", color="#10b981"),
            TaskLabel(task_id=bt3.id, label="ux", color="#f59e0b"),
            TaskLabel(task_id=bt4.id, label="deploy", color="#a855f7"),
        ]
    )
    await db.flush()

    d1 = Document(
        project_id=p.id,
        epoch_id=e1.id,
        title="Репозиторий и docker-compose",
        content=_doc(
            "Запуск платформы",
            "Клон: git clone https://github.com/A24-0/bezum-hack-seamless.git. Локально: "
            "docker compose up (см. README). Связанные задачи: #1 (CI/CD), #4 (деплой).",
        ),
        visibility=DocumentVisibility.public,
        status=DocumentStatus.approved,
        created_by_id=dev.id,
        current_version=1,
    )
    d2 = Document(
        project_id=p.id,
        epoch_id=e1.id,
        title="Сдача кейса Seamless",
        content=_doc(
            "Критерии",
            "Связи сущностей в UX, версии документов, встречи, интеграция Kanban с PR и документами. "
            "Задачи #2 и #3.",
        ),
        visibility=DocumentVisibility.managers_devs,
        status=DocumentStatus.pending_review,
        created_by_id=manager.id,
        current_version=1,
    )
    d3 = Document(
        project_id=p.id,
        epoch_id=e1.id,
        title="Чеклист демонстрации жюри",
        content=_doc(
            "Сценарий",
            "1) Обзор проекта → 2) Канбан → 3) Документ с версиями → 4) CI/CD (ссылка на GitHub) → 5) Связи.",
        ),
        visibility=DocumentVisibility.public,
        status=DocumentStatus.draft,
        created_by_id=manager.id,
        current_version=1,
    )
    db.add_all([d1, d2, d3])
    await db.flush()

    db.add_all(
        [
            DocumentVersion(
                document_id=d1.id,
                version_num=1,
                content=d1.content,
                created_by_id=dev.id,
                change_summary="Первая версия",
            ),
            DocumentVersion(
                document_id=d2.id,
                version_num=1,
                content=d2.content,
                created_by_id=manager.id,
                change_summary="Черновик для жюри",
            ),
            DocumentVersion(
                document_id=d3.id,
                version_num=1,
                content=d3.content,
                created_by_id=manager.id,
                change_summary="Старт",
            ),
        ]
    )
    db.add_all(
        [
            DocumentTaskLink(document_id=d1.id, task_id=bt1.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=d1.id, task_id=bt4.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=d2.id, task_id=bt2.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=d2.id, task_id=bt3.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=d3.id, task_id=bt2.id, link_type=DocumentTaskLinkType.manual),
        ]
    )
    await db.flush()

    m_demo = Meeting(
        project_id=p.id,
        epoch_id=e1.id,
        task_id=bt3.id,
        title="Демо: связи и CI/CD",
        description="Проход по странице Связи и разделу CI/CD с репозиторием на GitHub",
        status=MeetingStatus.scheduled,
        scheduled_at=datetime.now(timezone.utc) + timedelta(days=1, hours=2),
        jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
        created_by_id=manager.id,
        summary="Кратко: показать матрицу документ↔задача и синхронизацию PR с GitHub.",
    )
    db.add(m_demo)
    await db.flush()
    db.add_all(
        [
            MeetingParticipant(meeting_id=m_demo.id, user_id=manager.id, status="accepted"),
            MeetingParticipant(meeting_id=m_demo.id, user_id=dev.id, status="accepted"),
            MeetingParticipant(meeting_id=m_demo.id, user_id=customer.id, status="pending"),
        ]
    )
    await db.flush()

    print(f"✅ Добавлен демо-проект «{BEZUM_SEAMLESS_NAME}» (GitHub: {BEZUM_SEAMLESS_REPO}) — PR подтягиваются только из GitHub после «Синхронизировать»")

    db.add(
        Release(
            epoch_id=e1.id,
            name="Alpha demo",
            description="Первая демо-сборка для проверки сценария Seamless",
            version_tag="v0.1.0-demo",
            created_by_id=manager.id,
        )
    )
    await db.flush()


async def seed_demo_data():
    async with AsyncSessionLocal() as db:
        def _doc(title: str, text: str) -> dict:
            return {
                "type": "doc",
                "content": [
                    {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": title}]},
                    {"type": "paragraph", "content": [{"type": "text", "text": text}]},
                ],
            }

        existing = await db.execute(select(User).limit(1))
        any_user_exists = existing.scalar_one_or_none() is not None

        # Backward-compat patch:
        # old demo projects stored GitLab URLs in `gitlab_repo_url`.
        # CI/CD UI and GitHub sync expect GitHub repo (owner/repo) now.
        demo_repo_url_map = {
            "https://gitlab.com/demo/ecommerce": "octocat/Hello-World",
            "https://gitlab.com/demo/support-suite": "octocat/Spoon-Knife",
        }

        async def _patch_demo_project_repos() -> None:
            if not demo_repo_url_map:
                return
            res = await db.execute(
                select(Project).where(Project.gitlab_repo_url.in_(list(demo_repo_url_map.keys())))
            )
            patched = 0
            for p in res.scalars().all():
                new_val = demo_repo_url_map.get(p.gitlab_repo_url)
                if new_val and p.gitlab_repo_url != new_val:
                    p.gitlab_repo_url = new_val
                    patched += 1
            if patched:
                await db.flush()

        # Если демо-данные уже частично есть (пользователи существуют),
        # сидер по старой логике вызывался не полностью и мог не создать admin.
        admin_email = "admin@demo.com"
        admin_exists_res = await db.execute(select(User).where(User.email == admin_email))
        admin_exists = admin_exists_res.scalar_one_or_none() is not None

        # Seed tech tags for cabinet matching (so /cabinet/match works immediately).
        demo_user_techs: dict[str, dict] = {
            "manager@demo.com": {
                "git_repo_url": "https://github.com/example/manager-demo",
                "techs": ["C#", ".NET", "PostgreSQL", "React", "TypeScript"],
            },
            "dev@demo.com": {
                "git_repo_url": "https://github.com/example/fullstack-dev",
                "techs": ["C#", ".NET", "React", "TypeScript", "FastAPI", "PostgreSQL"],
            },
            "qa@demo.com": {
                "git_repo_url": "https://github.com/example/qa-demo",
                "techs": ["C#", ".NET", "PostgreSQL", "React"],
            },
            "ops@demo.com": {
                "git_repo_url": "https://github.com/example/ops-demo",
                "techs": ["CI/CD", "GitHub", "PostgreSQL"],
            },
        }

        async def _patch_demo_user_techs() -> None:
            # Insert missing tech tags + repo links for demo users.
            for email, payload in demo_user_techs.items():
                res = await db.execute(select(User).where(User.email == email))
                u = res.scalar_one_or_none()
                if not u:
                    continue

                git_repo_url = (payload.get("git_repo_url") or "").strip() or None
                if git_repo_url and not getattr(u, "git_repo_url", None):
                    u.git_repo_url = git_repo_url

                techs = payload.get("techs") or []
                # Existing techs (case-insensitive)
                existing_res = await db.execute(select(UserTech.tech).where(UserTech.user_id == u.id))
                existing_set = {str(x or "").lower() for x in existing_res.scalars().all() if x}
                to_add = []
                for t in techs:
                    tt = (t or "").strip()
                    if not tt:
                        continue
                    if tt.lower() not in existing_set:
                        to_add.append(tt)

                for t in to_add:
                    db.add(UserTech(user_id=u.id, tech=t))

            await db.flush()

        if any_user_exists:
            # Добавляем только недостающего admin, чтобы админка заработала.
            if not admin_exists:
                admin_user = User(
                    email=admin_email,
                    name="System Admin",
                    role=UserRole.admin,
                    hashed_password=hash_password("password"),
                    is_active=True,
                )
                db.add(admin_user)
                await db.flush()

            # Патчим демо-проекты, у которых поле `gitlab_repo_url` осталось GitLab-URL.
            await _patch_demo_project_repos()
            await _patch_demo_user_techs()

            um = (await db.execute(select(User).where(User.email == "manager@demo.com"))).scalar_one_or_none()
            ud = (await db.execute(select(User).where(User.email == "dev@demo.com"))).scalar_one_or_none()
            uc = (await db.execute(select(User).where(User.email == "client@demo.com"))).scalar_one_or_none()
            uq = (await db.execute(select(User).where(User.email == "qa@demo.com"))).scalar_one_or_none()
            uo = (await db.execute(select(User).where(User.email == "ops@demo.com"))).scalar_one_or_none()
            if um and ud and uc and uq and uo:
                await _ensure_bezum_seamless_demo_bundle(db, um, ud, uc, uq, uo)

            await db.commit()
            return

        manager = User(email="manager@demo.com", name="Alice Product Manager", role=UserRole.manager, hashed_password=hash_password("password"), is_active=True)
        dev = User(email="dev@demo.com", name="Bob Fullstack Dev", role=UserRole.developer, hashed_password=hash_password("password"), is_active=True)
        customer = User(email="client@demo.com", name="Carol Client", role=UserRole.customer, hashed_password=hash_password("password"), is_active=True)
        dev2 = User(email="qa@demo.com", name="Dina QA Engineer", role=UserRole.developer, hashed_password=hash_password("password"), is_active=True)
        manager2 = User(email="ops@demo.com", name="Evan Delivery Lead", role=UserRole.manager, hashed_password=hash_password("password"), is_active=True)
        admin_user = User(
            email="admin@demo.com",
            name="System Admin",
            role=UserRole.admin,
            hashed_password=hash_password("password"),
            is_active=True,
        )
        db.add_all([manager, dev, customer, dev2, manager2, admin_user])
        await db.flush()

        # Save demo cabinet tech tags for newly created demo users.
        await _patch_demo_user_techs()

        project = Project(
            name="E-Commerce Platform",
            description="Unified platform for catalog, checkout, order tracking, and support workflows.",
            status=ProjectStatus.active,
            gitlab_repo_url="octocat/Hello-World",
        )
        project2 = Project(
            name="Support Automation Suite",
            description="Ticket triage automation and customer portal with SLA tracking.",
            status=ProjectStatus.active,
            gitlab_repo_url="octocat/Spoon-Knife",
        )
        db.add_all([project, project2])
        await db.flush()

        db.add(ProjectMember(project_id=project.id, user_id=manager.id, role=ProjectMemberRole.manager))
        db.add(ProjectMember(project_id=project.id, user_id=dev.id, role=ProjectMemberRole.developer))
        db.add(ProjectMember(project_id=project.id, user_id=dev2.id, role=ProjectMemberRole.developer))
        db.add(ProjectMember(project_id=project.id, user_id=customer.id, role=ProjectMemberRole.customer))
        db.add(ProjectMember(project_id=project2.id, user_id=manager2.id, role=ProjectMemberRole.manager))
        db.add(ProjectMember(project_id=project2.id, user_id=dev.id, role=ProjectMemberRole.developer))
        db.add(ProjectMember(project_id=project2.id, user_id=customer.id, role=ProjectMemberRole.customer))
        await db.flush()

        epoch1 = Epoch(project_id=project.id, name="Sprint 1: Foundation", goals="Auth, core entities, initial integrations", start_date=date.today() - timedelta(days=14), end_date=date.today() - timedelta(days=2), status=EpochStatus.completed, order_index=1)
        epoch2 = Epoch(project_id=project.id, name="Sprint 2: Collaboration", goals="Docs approvals, meetings, integrated notifications", start_date=date.today() - timedelta(days=1), end_date=date.today() + timedelta(days=13), status=EpochStatus.active, order_index=2)
        epoch3 = Epoch(project_id=project.id, name="Sprint 3: Delivery", goals="CI/CD workflow and release hardening", start_date=date.today() + timedelta(days=14), end_date=date.today() + timedelta(days=28), status=EpochStatus.planning, order_index=3)
        epoch4 = Epoch(project_id=project2.id, name="Sprint A: Intake Automation", goals="Automated intake and priority scoring", start_date=date.today() - timedelta(days=5), end_date=date.today() + timedelta(days=10), status=EpochStatus.active, order_index=1)
        db.add_all([epoch1, epoch2, epoch3, epoch4])
        await db.flush()

        t1 = Task(project_id=project.id, epoch_id=epoch1.id, title="Setup CI/CD pipeline", description="Configure GitLab CI/CD with staging and production environments", status=TaskStatus.done, reporter_id=manager.id, assignee_id=dev.id, order_index=1)
        t2 = Task(project_id=project.id, epoch_id=epoch2.id, title="Implement JWT authentication", description="Build user registration, login, and token refresh endpoints", status=TaskStatus.in_progress, reporter_id=manager.id, assignee_id=dev.id, due_date=datetime.now(timezone.utc) + timedelta(days=3), order_index=2)
        t3 = Task(project_id=project.id, epoch_id=epoch2.id, title="Design database schema", description="Create ERD and migrations for cross-core entities", status=TaskStatus.review, reporter_id=manager.id, assignee_id=dev2.id, order_index=3)
        t4 = Task(project_id=project.id, epoch_id=epoch2.id, title="Write API documentation", description="Document critical flows and integration points", status=TaskStatus.todo, reporter_id=manager.id, assignee_id=dev2.id, order_index=4)
        t5 = Task(project_id=project.id, epoch_id=epoch2.id, title="Clarify legal requirements", description="Collect missing compliance requirements from customer", status=TaskStatus.needs_info, reporter_id=manager.id, assignee_id=manager.id, order_index=5)
        t6 = Task(project_id=project.id, epoch_id=epoch3.id, title="Release checklist automation", description="Introduce release gates and changelog generator", status=TaskStatus.backlog, reporter_id=manager.id, assignee_id=dev.id, order_index=6)
        t7 = Task(project_id=project2.id, epoch_id=epoch4.id, title="Ticket classifier model", description="Train initial text classifier for support requests", status=TaskStatus.in_progress, reporter_id=manager2.id, assignee_id=dev.id, order_index=1)
        t8 = Task(project_id=project2.id, epoch_id=epoch4.id, title="SLA breach alerts", description="Send proactive alerts for near-breach tickets", status=TaskStatus.todo, reporter_id=manager2.id, assignee_id=dev2.id, order_index=2)
        t9 = Task(project_id=project.id, epoch_id=epoch2.id, title="Нагрузочное тестирование API", description="Сценарии k6: каталог, корзина, checkout; отчёты в Grafana", status=TaskStatus.todo, reporter_id=manager.id, assignee_id=dev2.id, order_index=9)
        t10 = Task(project_id=project.id, epoch_id=epoch2.id, title="Интеграция платёжного шлюза", description="Sandbox, webhooks, идемпотентность, журнал операций", status=TaskStatus.in_progress, reporter_id=manager.id, assignee_id=dev.id, order_index=10)
        t11 = Task(project_id=project.id, epoch_id=epoch2.id, title="Мобильная витрина (PWA)", description="Офлайн-корзина, push-уведомления о статусе заказа", status=TaskStatus.backlog, reporter_id=manager.id, assignee_id=dev.id, order_index=11)
        t12 = Task(project_id=project.id, epoch_id=epoch2.id, title="Аудит безопасности OWASP", description="Чеклист ASVS, отчёт для заказчика", status=TaskStatus.review, reporter_id=manager.id, assignee_id=dev2.id, order_index=12)
        t13 = Task(project_id=project.id, epoch_id=epoch1.id, title="Резервное копирование БД", description="Ежедневные снапшоты, тест восстановления", status=TaskStatus.done, reporter_id=manager.id, assignee_id=dev2.id, order_index=13)
        t14 = Task(project_id=project.id, epoch_id=epoch3.id, title="Мультитенантность (подготовка)", description="Исследование изоляции данных и схемы миграций", status=TaskStatus.needs_info, reporter_id=manager.id, assignee_id=manager.id, order_index=14)
        t15 = Task(project_id=project2.id, epoch_id=epoch4.id, title="Портал клиента: SSO", description="OIDC, роли, аудит входов", status=TaskStatus.todo, reporter_id=manager2.id, assignee_id=dev.id, order_index=3)
        t16 = Task(project_id=project2.id, epoch_id=epoch4.id, title="Отчёты SLA", description="Дашборды по очередям и нарушениям", status=TaskStatus.in_progress, reporter_id=manager2.id, assignee_id=dev2.id, order_index=4)
        db.add_all([t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16])
        await db.flush()

        db.add_all([
            TaskLabel(task_id=t2.id, label="backend", color="#6366f1"),
            TaskLabel(task_id=t2.id, label="auth", color="#f59e0b"),
            TaskLabel(task_id=t3.id, label="database", color="#10b981"),
            TaskLabel(task_id=t4.id, label="docs", color="#3b82f6"),
            TaskLabel(task_id=t6.id, label="release", color="#a855f7"),
            TaskLabel(task_id=t7.id, label="ml", color="#14b8a6"),
            TaskLabel(task_id=t9.id, label="perf", color="#ef4444"),
            TaskLabel(task_id=t10.id, label="payments", color="#8b5cf6"),
            TaskLabel(task_id=t12.id, label="security", color="#f97316"),
            TaskLabel(task_id=t15.id, label="sso", color="#06b6d4"),
        ])
        db.add_all([
            TaskWatcher(task_id=t2.id, user_id=manager.id),
            TaskWatcher(task_id=t2.id, user_id=dev2.id),
            TaskWatcher(task_id=t3.id, user_id=manager.id),
            TaskWatcher(task_id=t4.id, user_id=customer.id),
            TaskWatcher(task_id=t7.id, user_id=manager2.id),
            TaskWatcher(task_id=t9.id, user_id=manager.id),
            TaskWatcher(task_id=t10.id, user_id=customer.id),
            TaskWatcher(task_id=t16.id, user_id=manager2.id),
        ])
        await db.flush()

        doc1 = Document(
            project_id=project.id, epoch_id=epoch2.id, title="Business Requirements Document",
            content={"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Business Requirements"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Core scope for checkout and account area. Linked tasks: #2 and #4."}]}]},
            visibility=DocumentVisibility.public, status=DocumentStatus.approved, created_by_id=manager.id, current_version=2
        )
        doc2 = Document(
            project_id=project.id, epoch_id=epoch2.id, title="Technical Architecture",
            content={"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Technical Architecture"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "FastAPI + React + PostgreSQL, with cross-core entity linking and event notifications."}]}]},
            visibility=DocumentVisibility.managers_devs, status=DocumentStatus.pending_review, created_by_id=dev.id, current_version=3
        )
        doc3 = Document(
            project_id=project.id, title="Contract & Legal",
            content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Confidential contract details..."}]}]},
            visibility=DocumentVisibility.managers_only, status=DocumentStatus.approved, created_by_id=manager.id, current_version=1
        )
        doc4 = Document(
            project_id=project2.id, epoch_id=epoch4.id, title="Support Automation Scope",
            content={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Initial scope: classifier, SLA alerts, triage dashboard. References #7 and #8."}]}]},
            visibility=DocumentVisibility.public, status=DocumentStatus.draft, created_by_id=manager2.id, current_version=1
        )
        doc5 = Document(
            project_id=project.id, epoch_id=epoch2.id, title="План нагрузочного тестирования",
            content=_doc("Нагрузочное тестирование", "Целевые RPS, профили пользователей, связь с задачами #9 и #10. Отчёты хранятся в артефактах CI."),
            visibility=DocumentVisibility.public, status=DocumentStatus.draft, created_by_id=dev2.id, current_version=2
        )
        doc6 = Document(
            project_id=project.id, epoch_id=epoch2.id, title="Чеклист приёмки заказчика",
            content=_doc("Приёмка", "Критерии готовности релиза, сценарии демо, подписи сторон. См. также BRD и задачи #4, #12."),
            visibility=DocumentVisibility.managers_devs, status=DocumentStatus.pending_review, created_by_id=manager.id, current_version=1
        )
        doc7 = Document(
            project_id=project.id, title="Журнал интеграций с внешними системами",
            content=_doc("Интеграции", "Перечень систем, контакты, SLA ответа. Основа для экрана «Связи» и карты интеграций."),
            visibility=DocumentVisibility.public, status=DocumentStatus.approved, created_by_id=dev.id, current_version=1
        )
        doc8 = Document(
            project_id=project2.id, epoch_id=epoch4.id, title="Runbook: эскалация SLA",
            content=_doc("Runbook", "Шаги при нарушении SLA, уведомления, эскалация на дежурного. Связано с задачами #8 и #16."),
            visibility=DocumentVisibility.managers_devs, status=DocumentStatus.draft, created_by_id=dev2.id, current_version=2
        )
        doc9 = Document(
            project_id=project.id, epoch_id=epoch3.id, title="Roadmap Q3 (черновик)",
            content=_doc("Roadmap", "Платёжный шлюз, PWA, мультитенантность — приоритеты после стабилизации текущего спринта."),
            visibility=DocumentVisibility.public, status=DocumentStatus.draft, created_by_id=manager.id, current_version=1
        )
        db.add_all([doc1, doc2, doc3, doc4, doc5, doc6, doc7, doc8, doc9])
        await db.flush()
        db.add_all([
            DocumentVersion(document_id=doc1.id, version_num=1, content=doc1.content, created_by_id=manager.id, change_summary="Initial scope"),
            DocumentVersion(document_id=doc1.id, version_num=2, content=doc1.content, created_by_id=dev.id, change_summary="Added checkout acceptance criteria"),
            DocumentVersion(document_id=doc2.id, version_num=1, content=doc2.content, created_by_id=dev.id, change_summary="Initial architecture"),
            DocumentVersion(document_id=doc2.id, version_num=2, content=doc2.content, created_by_id=dev2.id, change_summary="Added meeting decisions"),
            DocumentVersion(document_id=doc2.id, version_num=3, content=doc2.content, created_by_id=manager.id, change_summary="Marked for review"),
            DocumentVersion(document_id=doc3.id, version_num=1, content=doc3.content, created_by_id=manager.id, change_summary="Legal baseline"),
            DocumentVersion(document_id=doc4.id, version_num=1, content=doc4.content, created_by_id=manager2.id, change_summary="Kickoff scope"),
            DocumentVersion(document_id=doc5.id, version_num=1, content=doc5.content, created_by_id=dev2.id, change_summary="Черновик плана"),
            DocumentVersion(document_id=doc5.id, version_num=2, content=doc5.content, created_by_id=manager.id, change_summary="Добавлены целевые метрики"),
            DocumentVersion(document_id=doc6.id, version_num=1, content=doc6.content, created_by_id=manager.id, change_summary="Первая версия приёмки"),
            DocumentVersion(document_id=doc7.id, version_num=1, content=doc7.content, created_by_id=dev.id, change_summary="Утверждённый журнал"),
            DocumentVersion(document_id=doc8.id, version_num=1, content=doc8.content, created_by_id=dev2.id, change_summary="Начальный runbook"),
            DocumentVersion(document_id=doc8.id, version_num=2, content=doc8.content, created_by_id=manager2.id, change_summary="Добавлена эскалация L2"),
            DocumentVersion(document_id=doc9.id, version_num=1, content=doc9.content, created_by_id=manager.id, change_summary="Черновик roadmap"),
        ])
        db.add_all([
            DocumentTaskLink(document_id=doc1.id, task_id=t2.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc1.id, task_id=t4.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=doc2.id, task_id=t3.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc4.id, task_id=t7.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc4.id, task_id=t8.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=doc5.id, task_id=t9.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc5.id, task_id=t10.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=doc6.id, task_id=t4.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc7.id, task_id=t12.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=doc8.id, task_id=t8.id, link_type=DocumentTaskLinkType.manual),
            DocumentTaskLink(document_id=doc8.id, task_id=t16.id, link_type=DocumentTaskLinkType.auto),
            DocumentTaskLink(document_id=doc9.id, task_id=t11.id, link_type=DocumentTaskLinkType.manual),
        ])
        await db.flush()

        meeting = Meeting(
            project_id=project.id, epoch_id=epoch1.id, task_id=t2.id,
            title="Sprint Planning Meeting", description="Discuss sprint goals and task assignments for collaboration sprint",
            status=MeetingStatus.completed,
            scheduled_at=datetime.now(timezone.utc) - timedelta(days=7),
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=manager.id,
            transcript="Alice: Let's discuss the authentication task.\nBob: I'll implement JWT with refresh tokens.\nAlice: Agreed, that's decided. Bob will implement JWT auth by end of week.\nBob: I need to review the database schema first, will assign myself to that too.",
            summary="**Key Decisions**\n• Bob will implement JWT authentication\n• Database schema review needed first\n\n**Action Items**\n• Bob: implement JWT by end of week\n• Bob: review and finalize database schema\n\n**Discussion Summary**\nTeam discussed sprint priorities and task assignments for the authentication module.",
        )
        meeting2 = Meeting(
            project_id=project.id, epoch_id=epoch2.id, task_id=t3.id,
            title="Architecture Review",
            description="Review DB schema and document linkage",
            status=MeetingStatus.scheduled,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=1, hours=3),
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=dev2.id,
        )
        meeting3 = Meeting(
            project_id=project2.id, epoch_id=epoch4.id, task_id=t7.id,
            title="Classifier Model Checkpoint",
            description="Discuss model quality and false positives",
            status=MeetingStatus.scheduling,
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=manager2.id,
        )
        meeting4 = Meeting(
            project_id=project.id, epoch_id=epoch2.id, task_id=t10.id,
            title="Демо: платежи и возвраты",
            description="Проход по sandbox, сценарии отказа и повторного списания",
            status=MeetingStatus.scheduled,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=3, hours=1),
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=manager.id,
            transcript="Alice: Покажем сценарий отмены и возврата.\nBob: Webhook payment.succeeded отработал, возврат в течение 5 минут.",
            summary="**Итоги**\n• Sandbox подтверждён\n• Договорились добавить алёрты по failed webhooks\n\n**Действия**\n• Bob: доработать логирование в задаче #10",
        )
        meeting5 = Meeting(
            project_id=project.id, epoch_id=epoch2.id, task_id=t9.id,
            title="Груминг бэклога нагрузки",
            description="Уточнение профилей и метрик для k6",
            status=MeetingStatus.scheduling,
            jitsi_room_id=str(uuid.uuid4()).replace("-", "")[:16],
            created_by_id=dev2.id,
        )
        db.add_all([meeting, meeting2, meeting3, meeting4, meeting5])
        await db.flush()
        db.add_all([
            MeetingParticipant(meeting_id=meeting.id, user_id=manager.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting.id, user_id=dev.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting2.id, user_id=manager.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting2.id, user_id=dev.id, status="pending"),
            MeetingParticipant(meeting_id=meeting2.id, user_id=dev2.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting3.id, user_id=manager2.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting3.id, user_id=dev.id, status="pending"),
            MeetingParticipant(meeting_id=meeting3.id, user_id=customer.id, status="pending"),
            MeetingParticipant(meeting_id=meeting4.id, user_id=manager.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting4.id, user_id=dev.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting4.id, user_id=customer.id, status="pending"),
            MeetingParticipant(meeting_id=meeting5.id, user_id=manager.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting5.id, user_id=dev2.id, status="accepted"),
            MeetingParticipant(meeting_id=meeting5.id, user_id=dev.id, status="accepted"),
        ])
        db.add_all([
            MeetingTimeProposal(meeting_id=meeting3.id, proposed_by_id=manager2.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=2, hours=2), votes={str(manager2.id): True}),
            MeetingTimeProposal(meeting_id=meeting3.id, proposed_by_id=manager2.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=2, hours=5), votes={str(manager2.id): True}),
            MeetingTimeProposal(meeting_id=meeting2.id, proposed_by_id=dev2.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=1, hours=2), votes={str(dev2.id): True, str(manager.id): True}),
            MeetingTimeProposal(meeting_id=meeting2.id, proposed_by_id=dev.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=1, hours=5), votes={str(dev.id): True}),
            MeetingTimeProposal(meeting_id=meeting5.id, proposed_by_id=dev2.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=4, hours=3), votes={str(dev2.id): True}),
            MeetingTimeProposal(meeting_id=meeting5.id, proposed_by_id=manager.id, proposed_at=datetime.now(timezone.utc) + timedelta(days=4, hours=6), votes={str(manager.id): True}),
        ])
        await db.flush()

        pr = PullRequest(
            project_id=project.id, task_id=t3.id,
            gitlab_pr_id=42, title="feat: add database migrations",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/42",
            source_branch="feature/3-database-schema",
            target_branch="main",
            status=PRStatus.open,
            author_id=dev.id,
        )
        pr2 = PullRequest(
            project_id=project.id, task_id=t2.id,
            gitlab_pr_id=43, title="feat: auth refresh tokens and session hardening",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/43",
            source_branch="feature/2-auth-hardening",
            target_branch="main",
            status=PRStatus.merged,
            author_id=dev.id,
        )
        pr3 = PullRequest(
            project_id=project2.id, task_id=t7.id,
            gitlab_pr_id=12, title="feat: baseline classifier pipeline",
            url="https://gitlab.com/demo/support-suite/-/merge_requests/12",
            source_branch="feature/7-ticket-classifier",
            target_branch="develop",
            status=PRStatus.open,
            author_id=dev2.id,
        )
        pr4 = PullRequest(
            project_id=project.id, task_id=t4.id,
            gitlab_pr_id=44, title="docs: OpenAPI и примеры для интеграций",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/44",
            source_branch="docs/4-api-spec",
            target_branch="main",
            status=PRStatus.open,
            author_id=dev2.id,
        )
        pr5 = PullRequest(
            project_id=project.id, task_id=t9.id,
            gitlab_pr_id=45, title="chore: k6 сценарии для каталога",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/45",
            source_branch="perf/9-load-tests",
            target_branch="main",
            status=PRStatus.open,
            author_id=dev.id,
        )
        pr6 = PullRequest(
            project_id=project.id, task_id=t12.id,
            gitlab_pr_id=46, title="security: отчёт ASVS и исправления",
            url="https://gitlab.com/demo/ecommerce/-/merge_requests/46",
            source_branch="feature/12-security-audit",
            target_branch="main",
            status=PRStatus.closed,
            author_id=dev2.id,
        )
        pr7 = PullRequest(
            project_id=project2.id, task_id=t15.id,
            gitlab_pr_id=13, title="feat: OIDC для портала клиента",
            url="https://gitlab.com/demo/support-suite/-/merge_requests/13",
            source_branch="feature/15-sso-portal",
            target_branch="develop",
            status=PRStatus.open,
            author_id=dev.id,
        )
        db.add_all([pr, pr2, pr3, pr4, pr5, pr6, pr7])
        await db.flush()

        await _ensure_bezum_seamless_demo_bundle(db, manager, dev, customer, dev2, manager2)
        await db.flush()

        db.add_all([
            Release(epoch_id=epoch1.id, name="Foundation release", description="Core platform baseline completed", version_tag="v0.9.0", created_by_id=manager.id),
            Release(epoch_id=epoch2.id, name="Collaboration beta", description="Docs + meetings integration", version_tag="v1.1.0-beta", created_by_id=manager.id),
            Release(epoch_id=epoch4.id, name="Support Suite Alpha", description="Классификатор и алёрты SLA", version_tag="v0.3.0-alpha", created_by_id=manager2.id),
        ])

        db.add_all([
            Notification(user_id=dev.id, type=NotificationType.task_status_changed, title="Задача переведена в Review", body="«Проектирование схемы БД» (#3) на ревью.", entity_type="task", entity_id=str(t3.id)),
            Notification(user_id=manager.id, type=NotificationType.document_updated, title="Документ обновлён", body="Техническая архитектура — версия 3.", entity_type="document", entity_id=str(doc2.id)),
            Notification(user_id=customer.id, type=NotificationType.meeting_scheduled, title="Приглашение на встречу", body="Architecture Review — запланировано на завтра.", entity_type="meeting", entity_id=str(meeting2.id)),
            Notification(user_id=dev2.id, type=NotificationType.pr_merged, title="PR слит", body="MR !43 слит, задача #2 обновлена.", entity_type="pr", entity_id=str(pr2.id)),
            Notification(user_id=manager.id, type=NotificationType.sprint_update, title="Спринт: прогресс", body="Sprint 2: Collaboration — 60% задач в работе или завершены.", entity_type="epoch", entity_id=str(epoch2.id)),
            Notification(user_id=dev.id, type=NotificationType.pr_updated, title="Новый MR на ревью", body="docs: OpenAPI и примеры (#44).", entity_type="pr", entity_id=str(pr4.id)),
            Notification(user_id=manager.id, type=NotificationType.document_updated, title="Новая версия документа", body="План нагрузочного тестирования — v2.", entity_type="document", entity_id=str(doc5.id)),
            Notification(user_id=customer.id, type=NotificationType.meeting_scheduled, title="Демо платежей", body="Встреча «Демо: платежи и возвраты» добавлена в календарь.", entity_type="meeting", entity_id=str(meeting4.id)),
            Notification(user_id=dev2.id, type=NotificationType.task_status_changed, title="Задача назначена", body="Нагрузочное тестирование API — вы назначены исполнителем.", entity_type="task", entity_id=str(t9.id)),
            Notification(user_id=manager2.id, type=NotificationType.pr_merged, title="MR в support-suite", body="Classifier pipeline (#12) в работе.", entity_type="pr", entity_id=str(pr3.id)),
            Notification(user_id=dev2.id, type=NotificationType.mention, title="Упоминание в документе", body="Вас упомянули в «Чеклист приёмки заказчика».", entity_type="document", entity_id=str(doc6.id)),
            Notification(user_id=manager.id, type=NotificationType.document_updated, title="Runbook обновлён", body="Эскалация SLA — версия 2.", entity_type="document", entity_id=str(doc8.id)),
        ])

        await db.commit()
        print("✅ Demo data seeded successfully")
        print("  manager@demo.com / password")
        print("  dev@demo.com / password")
        print("  client@demo.com / password")
        print("  qa@demo.com / password")
        print("  ops@demo.com / password")
        print(f"  Проект «{BEZUM_SEAMLESS_NAME}»: репо {BEZUM_SEAMLESS_REPO} (CI/CD, Связи, канбан)")

