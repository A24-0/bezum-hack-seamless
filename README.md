# Bezum Platform

Монорепозиторий: **React (Vite) + Nginx**, **FastAPI**, **PostgreSQL**. Один `docker compose` поднимает весь стек.

## Быстрый старт (локально)

Скопируйте override для портов и hot-reload (файл в `.gitignore`, в репозитории только пример):

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
cp .env.development.example .env
docker compose up -d --build
```

- UI: [http://localhost:8080](http://localhost:8080) (через Nginx; `/api` проксируется в backend)
- API напрямую (отладка): [http://localhost:8001/api/health](http://localhost:8001/api/health)

В `.env.development.example` по умолчанию **`SEED_DEMO_DATA=true`**: при первом запуске пустой БД создаются тестовые пользователи и проекты (в т.ч. `manager@demo.com` / `password`). В **продакшене** в `.env.production.example` задано **`SEED_DEMO_DATA=false`** — база только миграции, первых пользователей создаёте через **регистрацию** на сайте.

## Остановка

```bash
docker compose down
```

## Окружения и переменные

| Файл | Назначение |
|------|------------|
| `.env.example` | Общий шаблон переменных |
| `.env.development.example` | Шаблон для локальной разработки |
| `.env.production.example` | Шаблон для сервера (сильные пароли, `DOMAIN`) |

Скопируйте нужный файл в `.env` и отредактируйте. **Не коммитьте `.env`.**

Переменные портов хоста: `BACKEND_HOST_PORT`, `FRONTEND_HOST_PORT` (используются в `docker-compose.override.example.yml`).

**`SEED_DEMO_DATA`:** `true` только для локальной разработки; в проде всегда `false`.

## Production (HTTPS, Caddy)

На сервере **не** используйте `docker-compose.override.yml` (иначе откроются лишние порты). Задайте DNS на машину, откройте 80/443.

```bash
cp .env.production.example .env
# отредактируйте SECRET_KEY, POSTGRES_PASSWORD, DOMAIN
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build
```

Caddy читает `deploy/Caddyfile` и проксирует на `frontend:80` (Nginx уже отдаёт SPA и `/api`). TLS (Let’s Encrypt) включается для публичного `DOMAIN`.

Важно: команда с **явным** `-f docker-compose.yml -f docker-compose.prod.yml` **не подмешивает** `docker-compose.override.yml`, даже если он лежит рядом.

## Структура репозитория

```text
bezum-platform/
  backend/                 # FastAPI, SQLAlchemy, Alembic
  frontend/                # React + Vite; production-сборка в Nginx
  deploy/
    Caddyfile              # reverse proxy + TLS (prod overlay)
  docs/
    architecture.md        # схемы и потоки данных
  docker-compose.yml       # база: db + backend + frontend (без host-портов)
  docker-compose.override.example.yml  # локальные порты + reload
  docker-compose.prod.yml  # Caddy :80 / :443
```

## Архитектура

Подробнее: [docs/architecture.md](docs/architecture.md).

## Автозапуск и автопроверка

```bash
chmod +x scripts/up-dev.sh scripts/smoke-check.sh
./scripts/up-dev.sh
./scripts/smoke-check.sh
```

Что делает:
- `up-dev.sh` — готовит `.env` и `docker-compose.override.yml` (если их нет), пересоздаёт стек с `down -v`, поднимает все сервисы.
- `smoke-check.sh` — проверяет `docker compose ps`, `api/health`, фронт `200`, регистрацию тестового пользователя и защищённый `/api/projects`.
