# NestJS API: base + production-ready minimum

Реализовано:
- NestJS backend
- PostgreSQL + Prisma
- JWT auth (access + refresh token)
- refresh flow через отдельный refresh strategy/guard
- RBAC (`user`, `admin`)
- Swagger docs (`/api/docs`)
- Health-check (`/api/health`)
- Prisma seed для admin

## 1) Запуск PostgreSQL

```bash
docker compose up -d
```

## 2) Настройка env

```bash
cp .env.example .env
```

## 3) Prisma

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

## 4) Запуск API

```bash
npm run start:dev
```

## Основные эндпоинты

- `GET /api/health`
- `POST /api/users` - создать пользователя
- `POST /api/auth/login` - access + refresh
- `POST /api/auth/refresh` - обновить токены (Bearer **refreshToken**)
- `POST /api/auth/logout` - очистить refresh token
- `GET /api/users` - только admin
- `GET /api/users/:id` - любой авторизованный
- Swagger: `http://localhost:3000/api/docs`

## Быстрый сценарий

```bash
# login (после seed)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin12345"}'

# refresh (в Authorization передай refreshToken)
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Authorization: Bearer <refreshToken>"
```
