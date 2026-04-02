# Operational Cheatsheet

## Local dev

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
cp .env.development.example .env
docker compose up -d --build
./scripts/smoke-check.sh
```

## Stop / reset

```bash
docker compose down
docker compose down -v
```

## Useful diagnostics

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
curl -fsS http://localhost:8001/api/health
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8080
```

## Production start

```bash
cp .env.production.example .env
# edit SECRET_KEY, POSTGRES_PASSWORD, DOMAIN
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build
```

## GitLab webhook

- Endpoint: `/api/webhooks/gitlab`
- Event: `Merge Request Hook`
- Purpose: sync PR status and linked task updates

## Тестовые пользователи (только если `SEED_DEMO_DATA=true`)

После первого старта с пустой БД: `manager@demo.com`, `dev@demo.com`, `client@demo.com` / `password`. В проде сиды выключены — регистрация через UI.
