## 2026-04-01 - Bootstrap and validation

### Completed
- Added split environment templates: `.env.development.example` and `.env.production.example`
- Added production overlay: `docker-compose.prod.yml` with Caddy TLS proxy
- Added local override template: `docker-compose.override.example.yml`
- Added helper scripts: `scripts/up-dev.sh` and `scripts/smoke-check.sh`
- Added project documentation: `README.md`, `docs/architecture.md`
- Added project feature pages in frontend (overview, kanban, docs, meetings, members, notifications, ci/cd)
- Verified local stack: backend, db, frontend healthy
- Verified smoke checks: health, login, protected endpoint

### Issues Encountered
- Notification page was checking `read` while backend returns `is_read`
  - Fixed in `frontend/src/pages/NotificationsPage.tsx`
- Frontend API had `POST /projects/{id}/sync` without backend endpoint
  - Added placeholder endpoint in `backend/app/routers/cicd.py`

### Verification
- `docker compose config` -> OK
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` -> OK
- `./scripts/smoke-check.sh` -> passed
- `npm run build` (frontend) -> passed

### Next Steps
- Set real DNS and `DOMAIN` for production TLS
- Replace production secrets in `.env`
- Configure GitLab webhook to `POST /api/webhooks/gitlab`
- Add automated tests (backend API + frontend critical flows)
