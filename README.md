# Keitaro wrapper

Обёртка над рекламным трекером Keitaro: создание кампаний и редактор офферов.
ТЗ — в [.workspace/techtask/](.workspace/techtask/), план — в [.plan/PLAN.md](.plan/PLAN.md).

- `backend/` — FastAPI (Python 3.14), SQLite (`backend/data/app.db`)
- `frontend/` — React + Vite + TypeScript + Tailwind CSS v4

Спецификация сервисов (API, аутентификация) и разработка — в [SPEC.md](SPEC.md).

## Развёртывание

Нужны только Docker и Docker Compose.

```bash
# Секреты бекенда: скопировать и заменить JWT_SECRET на вывод `openssl rand -hex 32`
cp backend/.env.example backend/.env

# Собрать и поднять стек (backend, frontend, nginx)
docker compose up --build -d
```

Приложение — http://localhost:8080, документация API — http://localhost:8080/api/docs.
Логи: `docker compose logs -f`, остановка: `docker compose down`.

## Пользователи

Регистрации нет — пользователей заводит администратор:

```bash
docker compose exec -it backend python -m scripts.users create admin   # пароль спросит интерактивно
docker compose exec -it backend python -m scripts.users set-password admin
docker compose exec backend python -m scripts.users deactivate admin   # / activate
docker compose exec backend python -m scripts.users list
```
