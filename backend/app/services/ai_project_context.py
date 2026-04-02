"""
Build a compact, id-free text snapshot of a project for the AI assistant.
"""

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


def _enum_value(v) -> str:
    if v is None:
        return ""
    if hasattr(v, "value"):
        return str(v.value)
    return str(v)


def _join_titles(items: list, title_attr: str = "title", limit: int = 30) -> str:
    out: list[str] = []
    for x in items[:limit]:
        t = getattr(x, title_attr, None) or ""
        t = str(t).strip()
        if t:
            out.append(t)
    if not out:
        return "нет"
    extra = len(items) - len(out)
    s = "; ".join(out)
    if extra > 0:
        s += f" … (+{extra} ещё)"
    return s


async def build_project_ai_context(db: AsyncSession, project_id: int) -> str:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.tasks),
            selectinload(Project.documents),
            selectinload(Project.meetings),
            selectinload(Project.epochs),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        return "Проект не найден или недоступен."

    lines: list[str] = []
    lines.append(f"Текущий проект (название): {project.name}")
    if project.description:
        desc = project.description.strip()
        if len(desc) > 1200:
            desc = desc[:1200] + "…"
        lines.append(f"Описание проекта: {desc}")
    lines.append(f"Статус проекта: {_enum_value(project.status)}")

    repo = (project.gitlab_repo_url or "").strip()
    if repo:
        lines.append(f"Связанный репозиторий GitHub (строка подключения): {repo}")
    else:
        lines.append("Репозиторий GitHub в проекте не указан (раздел CI/CD).")

    tasks = list(project.tasks or [])
    lines.append(f"Всего задач: {len(tasks)}")
    if tasks:
        status_counts = Counter(_enum_value(t.status) for t in tasks)
        parts = [f"{k}={v}" for k, v in sorted(status_counts.items())]
        lines.append("Задачи по статусам: " + ", ".join(parts))
        lines.append("Примеры названий задач: " + _join_titles(tasks, "title", 25))

    docs = list(project.documents or [])
    lines.append(f"Всего документов: {len(docs)}")
    if docs:
        lines.append("Примеры документов (названия): " + _join_titles(docs, "title", 25))

    meetings = list(project.meetings or [])
    lines.append(f"Всего встреч: {len(meetings)}")
    if meetings:
        lines.append("Примеры встреч (названия): " + _join_titles(meetings, "title", 20))

    epochs = sorted(list(project.epochs or []), key=lambda e: (e.order_index or 0, e.id or 0))
    lines.append(f"Эпох/спринтов: {len(epochs)}")
    if epochs:
        names = [str(e.name).strip() for e in epochs if getattr(e, "name", None)]
        names = [n for n in names if n][:20]
        if names:
            lines.append("Эпохи (названия по порядку): " + " → ".join(names))

    lines.append(
        "Навигация в приложении: Канбан и Обзор — задачи; Документы — тексты и вложения; "
        "Встречи — созвоны; Связи — матрица документ–задача; CI/CD — GitHub и вебхуки; "
        "Личный кабинет — стек и подбор исполнителей."
    )

    return "\n".join(lines)
