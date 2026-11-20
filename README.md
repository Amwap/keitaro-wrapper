# Keitaro wrapper

Обёртка над рекламным трекером Keitaro: создание кампаний и редактор офферов.
ТЗ — в [.workspace/techtask/](.workspace/techtask/), план — в [.plan/PLAN.md](.plan/PLAN.md).

- `backend/` — FastAPI (Python 3.14), SQLite (`backend/data/app.db`)
- `frontend/` — React + Vite + TypeScript + Tailwind CSS v4

Спецификация сервисов (API, аутентификация) и разработка — в [SPEC.md](SPEC.md).

## Развёртывание

Нужны только Docker и Docker Compose.

```bash
# Секреты бекенда: скопировать, заменить JWT_SECRET на вывод `openssl rand -hex 32`
# и вписать KEITARO_API_KEY (админка Keitaro → Профиль → API ключи)
cp backend/.env.example backend/.env

# Собрать и поднять стек (backend, frontend, nginx)
docker compose up --build -d
```

Приложение — http://localhost:8080, документация API — http://localhost:8080/api/docs.
Логи: `docker compose logs -f`, остановка: `docker compose down`.

## Миграции

Схема БД ведётся Alembic (`backend/migrations/`). Бекенд сам применяет недостающие миграции
при старте, вручную:

```bash
docker compose exec backend alembic upgrade head        # применить
docker compose exec backend alembic current             # текущая ревизия
docker compose exec backend alembic revision --autogenerate -m "описание"   # новая миграция
```

База, созданная до перехода на Alembic, при первом старте помечается ревизией `0001`.

## Пользователи

Регистрации нет — пользователей заводит администратор:

```bash
docker compose exec -it backend python -m scripts.users create admin   # пароль спросит интерактивно
docker compose exec -it backend python -m scripts.users set-password admin
docker compose exec backend python -m scripts.users deactivate admin   # / activate
docker compose exec backend python -m scripts.users list
```
