import httpx

from app.config import settings


def _pr_state_to_status(state: str, merged: bool) -> str:
    s = (state or "").lower()
    if merged:
        return "merged"
    if s == "closed":
        return "closed"
    return "open"


def _normalize_repo_full_name(repo: str) -> str:
    """
    Accept either:
      - owner/repo
      - https://github.com/owner/repo
    and return owner/repo
    """
    r = (repo or "").strip()
    if not r:
        raise ValueError("Repository is empty")

    # git@github.com:owner/repo.git -> owner/repo
    if r.startswith("git@github.com:"):
        tail = r.split("git@github.com:", 1)[1].strip()
        tail = tail.split("?", 1)[0].split("#", 1)[0].strip("/")
        if tail.endswith(".git"):
            tail = tail[: -len(".git")]
        parts = tail.split("/")
        if len(parts) >= 2 and parts[0] and parts[1]:
            return f"{parts[0]}/{parts[1]}"

    # 1) owner/repo
    if "/" in r and not r.startswith("http"):
        parts = r.split("/")
        if len(parts) >= 2 and parts[0] and parts[1]:
            owner, name = parts[0], parts[1]
            name = name[:-4] if name.endswith(".git") else name
            return f"{owner}/{name}"

    # 2) https://github.com/owner/repo
    if "github.com" in r:
        # Examples:
        # - https://github.com/owner/repo
        # - github.com/owner/repo
        tail = r.split("github.com", 1)[1]
        tail = tail.strip("/")
        parts = tail.split("/")
        if len(parts) >= 2 and parts[0] and parts[1]:
            owner, name = parts[0], parts[1]
            name = name[:-4] if name.endswith(".git") else name
            return f"{owner}/{name}"

    raise ValueError("Unsupported repo format. Use `owner/repo` or `https://github.com/owner/repo`.")


async def fetch_pull_requests(repo: str) -> list[dict]:
    """
    Fetch GitHub PRs from REST API.
    We intentionally keep the return shape as plain dicts so router can upsert.
    """
    repo_full_name = _normalize_repo_full_name(repo)
    owner, name = repo_full_name.split("/", 1)

    base = settings.GITHUB_API_URL.rstrip("/")
    headers = {
        "Accept": "application/vnd.github+json",
    }
    if settings.GITHUB_TOKEN and settings.GITHUB_TOKEN.strip():
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"

    prs: list[dict] = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Simple pagination - enough for UI/demo usage
        page = 1
        per_page = 100
        while True:
            url = f"{base}/repos/{owner}/{name}/pulls"
            r = await client.get(url, headers=headers, params={"state": "all", "per_page": per_page, "page": page})
            r.raise_for_status()
            chunk = r.json() or []
            if not isinstance(chunk, list):
                break
            prs.extend(chunk)
            if len(chunk) < per_page:
                break
            page += 1
            if page > 5:  # safety cap
                break
    return prs


def github_pr_to_pr_status(pr: dict) -> str:
    state = pr.get("state") or ""
    merged = bool(pr.get("merged_at"))
    return _pr_state_to_status(state=state, merged=merged)

