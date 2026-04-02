import httpx

from app.config import settings


async def fetch_merge_requests(gitlab_project_id: int) -> list[dict]:
    if not settings.GITLAB_TOKEN:
        raise ValueError("GITLAB_TOKEN is not configured")
    base = settings.GITLAB_API_URL.rstrip("/")
    url = f"{base}/projects/{gitlab_project_id}/merge_requests"
    headers = {"PRIVATE-TOKEN": settings.GITLAB_TOKEN}
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(url, headers=headers, params={"per_page": 100, "state": "all"})
        r.raise_for_status()
        return r.json()


def mr_state_to_pr_status(state: str) -> str:
    s = (state or "").lower()
    if s == "merged":
        return "merged"
    if s == "closed":
        return "closed"
    return "open"
