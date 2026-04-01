from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.cicd import PullRequest, PRStatus
from app.models.task import Task, TaskStatus, TaskWatcher
from app.models.project import Release
from app.models.notification import NotificationType
from app.services.auth import get_current_user
from app.services.notification import notify_many
from app.utils.permissions import require_project_access, require_manager_or_developer

router = APIRouter(tags=["cicd"])


@router.get("/projects/{project_id}/prs")
async def list_prs(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    result = await db.execute(
        select(PullRequest).options(selectinload(PullRequest.author))
        .where(PullRequest.project_id == project_id)
        .order_by(PullRequest.created_at.desc())
    )
    prs = result.scalars().all()
    return [
        {
            "id": p.id,
            "project_id": p.project_id,
            "task_id": p.task_id,
            "gitlab_pr_id": p.gitlab_pr_id,
            "title": p.title,
            "url": p.url,
            "status": p.status,
            "source_branch": p.source_branch,
            "target_branch": p.target_branch,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "author": {"id": p.author.id, "name": p.author.name} if p.author else None,
        }
        for p in prs
    ]


@router.post("/projects/{project_id}/prs/{pr_id}/link")
async def link_pr_to_task(
    project_id: int,
    pr_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(select(PullRequest).where(PullRequest.id == pr_id))
    pr = result.scalar_one_or_none()
    if not pr:
        raise HTTPException(404, "PR not found")
    pr.task_id = data.get("task_id")
    await db.flush()
    return {"id": pr.id, "task_id": pr.task_id}


@router.get("/projects/{project_id}/releases")
async def list_releases(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_project_access(db, project_id, current_user)
    from app.models.epoch import Epoch
    result = await db.execute(
        select(Release).join(Epoch, Release.epoch_id == Epoch.id)
        .options(selectinload(Release.created_by), selectinload(Release.epoch))
        .where(Epoch.project_id == project_id)
        .order_by(Release.created_at.desc())
    )
    releases = result.scalars().all()
    return [
        {
            "id": r.id,
            "epoch_id": r.epoch_id,
            "epoch": {"id": r.epoch.id, "name": r.epoch.name} if r.epoch else None,
            "name": r.name,
            "description": r.description,
            "version_tag": r.version_tag,
            "created_at": r.created_at,
            "created_by": {"id": r.created_by.id, "name": r.created_by.name} if r.created_by else None,
        }
        for r in releases
    ]


@router.post("/webhooks/gitlab")
async def gitlab_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle GitLab merge request webhooks."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_type = request.headers.get("X-Gitlab-Event", "")
    if event_type != "Merge Request Hook":
        return {"status": "ignored"}

    mr = payload.get("object_attributes", {})
    gitlab_pr_id = mr.get("iid") or mr.get("id")
    mr_state = mr.get("state", "")
    mr_title = mr.get("title", "")
    mr_url = mr.get("url", "")
    source_branch = mr.get("source_branch", "")
    target_branch = mr.get("target_branch", "")
    project_url = payload.get("project", {}).get("web_url", "")

    if not gitlab_pr_id:
        return {"status": "no pr id"}

    # Find existing PR or create
    result = await db.execute(select(PullRequest).where(PullRequest.gitlab_pr_id == gitlab_pr_id))
    pr = result.scalar_one_or_none()

    if pr:
        old_status = pr.status
        if mr_state == "merged":
            pr.status = PRStatus.merged
        elif mr_state == "closed":
            pr.status = PRStatus.closed
        elif mr_state == "opened":
            pr.status = PRStatus.open
        pr.title = mr_title
        await db.flush()

        # If merged, update linked task to review
        if mr_state == "merged" and pr.task_id:
            task_result = await db.execute(
                select(Task).options(selectinload(Task.watchers))
                .where(Task.id == pr.task_id)
            )
            task = task_result.scalar_one_or_none()
            if task:
                task.status = TaskStatus.review
                watcher_ids = [w.user_id for w in task.watchers]
                if task.assignee_id:
                    watcher_ids.append(task.assignee_id)
                await notify_many(db, list(set(watcher_ids)), NotificationType.pr_merged, f"PR merged: {mr_title}", f"Task '{task.title}' moved to Review", "task", str(task.id))
    else:
        # Try to find project by gitlab_repo_url
        from app.models.project import Project
        project_result = await db.execute(
            select(Project).where(Project.gitlab_repo_url.ilike(f"%{project_url.split('/')[-1]}%"))
        )
        project = project_result.scalar_one_or_none()
        if project:
            new_pr = PullRequest(
                project_id=project.id,
                gitlab_pr_id=gitlab_pr_id,
                title=mr_title,
                url=mr_url,
                source_branch=source_branch,
                target_branch=target_branch,
                status=PRStatus.open if mr_state == "opened" else PRStatus.closed,
            )
            # Try to auto-link to task by branch name (e.g. "feature/TASK-123-description")
            import re
            match = re.search(r'(\d+)', source_branch)
            if match:
                task_id = int(match.group(1))
                task_check = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project.id))
                if task_check.scalar_one_or_none():
                    new_pr.task_id = task_id
            db.add(new_pr)
            await db.flush()

    return {"status": "ok"}
