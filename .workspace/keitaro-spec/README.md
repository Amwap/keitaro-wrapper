# Keitaro: разведка и спецификация

Материалы для разработки обёртки (этап 2 [плана](../../.plan/PLAN.md)). Собрано 2026-11-19.

| Файл | Что внутри |
|---|---|
| [investigation.md](investigation.md) | Доступ, права, что есть на инстансе, эталонная структура кампании, решения и следующие шаги |
| [endpoints.md](endpoints.md) | Эндпоинты Admin API v1 и соответствие внутреннему API админки: запросы, ответы, поля |
| [flows.md](flows.md) | Сценарии: создание кампании, редактор офферов, статистика — в виде последовательности вызовов |
| [samples/](samples/) | Реальные ответы инстанса (токены вычищены) |
| [tools/kproxy.py](tools/kproxy.py) | Прокладка для запросов: сама берёт креды из корневого `.env`, наружу их не выводит |
| [openapi.json](openapi.json), [openapi.yaml](openapi.yaml) | Официальная спецификация Keitaro Admin API v1 (https://admin-api.docs.keitaro.io/) |

Коротко:

- Инстанс `https://tlgk.host`, за Cloudflare — нужен браузерный `User-Agent`.
- Логин/пароль дают сессию во внутренний API админки (`/admin/?object=...`) — работает.
  Admin API v1 (`/admin_api/v1`) принимает только `Api-Key`; права на создание ключа у пользователя есть.
- Инстанс общий для кандидатов: один домен `kylovoa.com`, группа и источник `FORTESTS`, один доступный оффер 18813.
- Структура «поток гео → Google + поток с офферами» и статистика «Клики / Уник. / Боты» подтверждены на реальных данных.

## Прокладка

```bash
python .workspace/keitaro-spec/tools/kproxy.py login
python .workspace/keitaro-spec/tools/kproxy.py admin streams.index -q campaign_id=211913
python .workspace/keitaro-spec/tools/kproxy.py admin reports.build -d '{"range":{"interval":"all_time"},"grouping":["stream_id"],"metrics":["clicks"]}'
python .workspace/keitaro-spec/tools/kproxy.py api GET /campaigns -o .workspace/keitaro-spec/samples/api/campaigns.json   # нужен KEITARO_API_KEY
```

Пишущие запросы блокируются без `--write`. Cookie сессии — в `tools/.session/cookies.txt` (исключён `tools/.gitignore`).
Поля `token`, `api_key`, `password`, `secret` в ответах заменяются на `***`.
