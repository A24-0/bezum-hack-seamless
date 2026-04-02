import re
import hmac
import hashlib
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.cicd import PullRequest, PRStatus
from app.models.task import Task, TaskStatus, TaskWatcher
from app.models.project import Project, Release
from app.models.notification import NotificationType
from app.services.auth import get_current_user
from app.services.notification import notify_many
from app.services.gitlab_sync import fetch_merge_requests, mr_state_to_pr_status
from app.services.github_sync import fetch_pull_requests, github_pr_to_pr_status, _normalize_repo_full_name
from app.utils.permissions import require_project_access, require_manager_or_developer

router = APIRouter(tags=["cicd"])


def _verify_gitlab_webhook(request: Request) -> None:
    secret = (settings.GITLAB_WEBHOOK_SECRET or "").strip()
    if not secret:
        return
    token = request.headers.get("X-Gitlab-Token") or request.headers.get("x-gitlab-token")
    if token != secret:
        raise HTTPException(status_code=403, detail="Invalid GitLab webhook token")


def _verify_github_webhook(request: Request) -> None:
    secret = (settings.GITHUB_WEBHOOK_SECRET or "").strip()
    if not secret:
        return

    signature = request.headers.get("X-Hub-Signature-256") or ""
    if "=" not in signature:
        raise HTTPException(status_code=403, detail="Invalid GitHub webhook signature")

    algo, provided = signature.split("=", 1)
    if algo.strip().lower() != "sha256":
        raise HTTPException(status_code=403, detail="Invalid GitHub signature algorithm")

    body = request.scope.get("body", None)
    if body is None:
        # FastAPI doesn't expose raw body by default; we must read it once.
        # NOTE: reading body here is fine because we don't read it again later.
        raise HTTPException(status_code=500, detail="GitHub webhook body missing in request scope")

    mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, provided):
        raise HTTPException(status_code=403, detail="Invalid GitHub webhook signature")


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
        .order_by(PullRequest.updated_at.desc())
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


@router.post("/projects/{project_id}/sync")
async def sync_gitlab(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Синхронизирует PR из GitHub (если настроено) или из GitLab (fallback)."""
    await require_manager_or_developer(db, project_id, current_user)
    res = await db.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    # Prefer GitHub when repo is configured (token optional: for public repos can work unauthenticated)
    if project.gitlab_repo_url:
        try:
            mrs = await fetch_pull_requests(project.gitlab_repo_url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404 and not (settings.GITHUB_TOKEN and settings.GITHUB_TOKEN.strip()):
                raise HTTPException(
                    503,
                    detail=(
                        "GitHub API 404. Репозиторий может быть неправильным или приватным. "
                        "Проверь поле репозитория (owner/repo или https://github.com/owner/repo) "
                        "и добавь GITHUB_TOKEN (scope repo), если репо приватное."
                    ),
                )
            raise HTTPException(502, detail=f"GitHub API HTTP {e.response.status_code}: {e.response.text[:200]}")
        except ValueError as e:
            # Обычно это неверно указанная строка репозитория/формат.
            raise HTTPException(400, detail=str(e))
        except Exception as e:
            raise HTTPException(502, detail=f"GitHub sync failed: {e!s}") from e

        synced = 0
        for pr in mrs:
            number = pr.get("number")
            if number is None:
                continue
            iid = int(number)
            existing = await db.execute(
                select(PullRequest).where(
                    PullRequest.project_id == project_id,
                    PullRequest.gitlab_pr_id == iid,
                )
            )
            pr_row = existing.scalar_one_or_none()
            st = PRStatus(github_pr_to_pr_status(pr))
            title = pr.get("title") or "Pull request"
            url = pr.get("html_url") or ""
            src = (pr.get("head") or {}).get("ref") or ""
            tgt = (pr.get("base") or {}).get("ref") or "main"
            if pr_row:
                pr_row.title = title
                pr_row.url = url
                pr_row.source_branch = src
                pr_row.target_branch = tgt
                pr_row.status = st
            else:
                pr_row = PullRequest(
                    project_id=project_id,
                    gitlab_pr_id=iid,
                    title=title,
                    url=url,
                    source_branch=src,
                    target_branch=tgt,
                    status=st,
                )
                db.add(pr_row)
            synced += 1
            # If we can parse a task id from branch name, attach PR to that task
            # (same heuristic as GitLab branch parsing).
            if src:
                match = re.search(r"(\d+)", src)
                if match and not (pr_row and pr_row.task_id):
                    task_id = int(match.group(1))
                    task_check = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
                    if task_check.scalar_one_or_none():
                        if pr_row:
                            pr_row.task_id = task_id
                        # pr_row уже существует (либо был, либо мы создали его выше)

        await db.flush()
        return {
            "status": "ok",
            "message": "Pull requests синхронизированы из GitHub",
            "synced": synced,
            "total_from_gitlab": len(mrs),  # keep old response shape for frontend
        }

    # Fallback to GitLab
    if not project.gitlab_project_id:
        raise HTTPException(
            400,
            detail="Укажите numeric GitLab Project ID в настройках проекта (поле gitlab_project_id).",
        )
    if not settings.GITLAB_TOKEN.strip():
        raise HTTPException(
            503,
            detail="На сервере не задан GITLAB_TOKEN — добавьте personal access token с scope api.",
        )
    try:
        mrs = await fetch_merge_requests(project.gitlab_project_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, detail=f"GitLab API HTTP {e.response.status_code}: {e.response.text[:200]}")
    except ValueError as e:
        raise HTTPException(503, detail=str(e))
    except Exception as e:
        raise HTTPException(502, detail=f"GitLab sync failed: {e!s}") from e

    synced = 0
    for mr in mrs:
        iid = mr.get("iid")
        if iid is None:
            continue
        iid = int(iid)
        existing = await db.execute(
            select(PullRequest).where(
                PullRequest.project_id == project_id,
                PullRequest.gitlab_pr_id == iid,
            )
        )
        pr = existing.scalar_one_or_none()
        st = PRStatus(mr_state_to_pr_status(str(mr.get("state", ""))))
        title = mr.get("title") or "Merge request"
        url = mr.get("web_url") or ""
        src = mr.get("source_branch") or ""
        tgt = mr.get("target_branch") or "main"
        if pr:
            pr.title = title
            pr.url = url
            pr.source_branch = src
            pr.target_branch = tgt
            pr.status = st
        else:
            db.add(
                PullRequest(
                    project_id=project_id,
                    gitlab_pr_id=iid,
                    title=title,
                    url=url,
                    source_branch=src,
                    target_branch=tgt,
                    status=st,
                )
            )
        synced += 1
    await db.flush()
    return {
        "status": "ok",
        "message": "Merge requests синхронизированы из GitLab",
        "synced": synced,
        "total_from_gitlab": len(mrs),
    }


@router.post("/projects/{project_id}/prs/{pr_id}/link")
async def link_pr_to_task(
    project_id: int,
    pr_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_manager_or_developer(db, project_id, current_user)
    result = await db.execute(
        select(PullRequest).where(PullRequest.id == pr_id, PullRequest.project_id == project_id)
    )
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
        select(Release)
        .join(Epoch, Release.epoch_id == Epoch.id)
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
    """GitLab Merge Request Hook. Подключите webhook в GitLab → Settings → Webhooks, URL: {origin}/api/webhooks/gitlab"""
    _verify_gitlab_webhook(request)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_type = request.headers.get("X-Gitlab-Event", "")
    if event_type != "Merge Request Hook":
        return {"status": "ignored", "reason": "not_merge_request"}

    mr = payload.get("object_attributes", {})
    gitlab_pr_id = mr.get("iid") or mr.get("id")
    mr_state = str(mr.get("state", "")).lower()
    mr_title = mr.get("title", "")
    mr_url = mr.get("url", "")
    source_branch = mr.get("source_branch", "")
    target_branch = mr.get("target_branch", "")
    gl_project = payload.get("project") or {}
    gl_project_id = gl_project.get("id")
    project_url = gl_project.get("web_url", "")

    if not gitlab_pr_id:
        return {"status": "no_pr_id"}

    pr_row = None
    if gl_project_id:
        res = await db.execute(
            select(Project).where(Project.gitlab_project_id == int(gl_project_id))
        )
        seamless = res.scalar_one_or_none()
        if seamless:
            pr_row = await _upsert_pr_from_webhook(
                db,
                seamless.id,
                int(gitlab_pr_id),
                mr_title,
                mr_url,
                source_branch,
                target_branch,
                mr_state,
            )

    if pr_row is None:
        project_result = await db.execute(
            select(Project).where(Project.gitlab_repo_url.isnot(None)).where(
                Project.gitlab_repo_url.ilike(f"%{project_url.split('/')[-1]}%")
            )
        )
        project = project_result.scalar_one_or_none()
        if project:
            pr_row = await _upsert_pr_from_webhook(
                db,
                project.id,
                int(gitlab_pr_id),
                mr_title,
                mr_url,
                source_branch,
                target_branch,
                mr_state,
            )

    if pr_row and mr_state == "merged" and pr_row.task_id:
        task_result = await db.execute(
            select(Task).options(selectinload(Task.watchers)).where(Task.id == pr_row.task_id)
        )
        task = task_result.scalar_one_or_none()
        if task:
            task.status = TaskStatus.review
            watcher_ids = [w.user_id for w in task.watchers]
            if task.assignee_id:
                watcher_ids.append(task.assignee_id)
            await notify_many(
                db,
                list(set(watcher_ids)),
                NotificationType.pr_merged,
                f"PR merged: {mr_title}",
                f"Task '{task.title}' moved to Review",
                "task",
                str(task.id),
            )

    await db.flush()
    return {"status": "ok"}


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """GitHub Pull Request webhook. Подключите webhook в GitHub → Webhook settings."""
    # Read raw body once and keep it in scope for signature verification
    raw_body = await request.body()
    request.scope["body"] = raw_body

    _verify_github_webhook(request)

    event_type = request.headers.get("X-GitHub-Event", "")
    if event_type != "pull_request":
        return {"status": "ignored", "reason": "not_pull_request"}

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    pr = (payload.get("pull_request") or {}) if isinstance(payload, dict) else {}
    number = pr.get("number")
    if number is None:
        return {"status": "no_pr_number"}

    action = payload.get("action", "") or ""
    merged = bool(pr.get("merged_at")) or bool(pr.get("merged"))
    pr_number = int(number)

    title = pr.get("title") or "Pull request"
    html_url = pr.get("html_url") or ""
    source_branch = ((pr.get("head") or {}).get("ref") or "").strip()
    target_branch = ((pr.get("base") or {}).get("ref") or "").strip() or "main"

    repo = payload.get("repository") or {}
    repo_full_name = repo.get("full_name") or ""
    repo_name = repo_full_name.split("/")[-1] if repo_full_name else ""

    # Find project by repo name/url match
    project_row = None
    if repo_full_name:
        normalized = _normalize_repo_full_name(repo_full_name)
        repo_tail = normalized.split("/")[-1]
        res = await db.execute(
            select(Project).where(Project.gitlab_repo_url.isnot(None)).where(
                Project.gitlab_repo_url.ilike(f"%{repo_tail}%")
            )
        )
        project_row = res.scalar_one_or_none()
    else:
        if repo_name:
            res = await db.execute(
                select(Project).where(Project.gitlab_repo_url.isnot(None)).where(
                    Project.gitlab_repo_url.ilike(f"%{repo_name}%")
                )
            )
            project_row = res.scalar_one_or_none()

    if not project_row:
        return {"status": "no_project"}

    # Map webhook action to internal PRStatus
    if merged:
        mr_state = "merged"
    elif action == "closed":
        mr_state = "closed"
    else:
        mr_state = "open"

    pr_row = await _upsert_pr_from_webhook(
        db=db,
        project_id=project_row.id,
        gitlab_pr_id=pr_number,
        title=title,
        url=html_url,
        source_branch=source_branch,
        target_branch=target_branch,
        mr_state=mr_state,
    )

    if pr_row and pr_row.task_id and merged:
        task_result = await db.execute(
            select(Task).options(selectinload(Task.watchers)).where(Task.id == pr_row.task_id)
        )
        task = task_result.scalar_one_or_none()
        if task:
            task.status = TaskStatus.review
            watcher_ids = [w.user_id for w in task.watchers]
            if task.assignee_id:
                watcher_ids.append(task.assignee_id)
            await notify_many(
                db,
                list(set(watcher_ids)),
                NotificationType.pr_merged,
                f"PR merged: {title}",
                f"Task '{task.title}' moved to Review",
                "task",
                str(task.id),
            )

    await db.flush()
    return {"status": "ok"}


async def _upsert_pr_from_webhook(
    db: AsyncSession,
    project_id: int,
    gitlab_pr_id: int,
    title: str,
    url: str,
    source_branch: str,
    target_branch: str,
    mr_state: str,
) -> PullRequest | None:
    st = PRStatus(mr_state_to_pr_status(mr_state))
    result = await db.execute(
        select(PullRequest).where(
            PullRequest.project_id == project_id,
            PullRequest.gitlab_pr_id == gitlab_pr_id,
        )
    )
    pr = result.scalar_one_or_none()
    if pr:
        pr.title = title
        pr.url = url
        pr.source_branch = source_branch
        pr.target_branch = target_branch
        pr.status = st
        return pr
    new_pr = PullRequest(
        project_id=project_id,
        gitlab_pr_id=gitlab_pr_id,
        title=title or "Merge request",
        url=url,
        source_branch=source_branch,
        target_branch=target_branch or "main",
        status=st,
    )
    match = re.search(r"(\d+)", source_branch)
    if match:
        task_id = int(match.group(1))
        task_check = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
        if task_check.scalar_one_or_none():
            new_pr.task_id = task_id
    db.add(new_pr)
    return new_pr
