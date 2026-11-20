# Keitaro wrapper — спецификация

Развёртывание и пользователи — в [README](README.md). План работ — в [.plan/PLAN.md](.plan/PLAN.md).

## Аутентификация

JWT без регистрации и восстановления пароля — пользователей заводит администратор командой.
Пароли хешируются argon2id (`pwdlib`).

- `POST /api/auth/login` (form: `username`, `password`) → access-токен (15 мин) в теле
  + refresh-токен (7 дней) в httpOnly-cookie на пути `/api/auth`
- `POST /api/auth/refresh` → новый access-токен по cookie
- `POST /api/auth/logout` → отзывает все токены пользователя
- `GET /api/auth/me` → текущий пользователь

Защищённый роут: добавьте параметр `user: CurrentUser` (из `app.api.deps`).
У каждого пользователя есть `token_version`, зашитый в JWT; logout, смена пароля и деактивация
его увеличивают, поэтому все ранее выданные токены перестают работать.

Секрет `JWT_SECRET` (≥ 32 символа) обязателен и хранится в `backend/.env`
(скопируйте из `backend/.env.example`). Docker compose подключает этот же файл через `env_file`,
пути и CORS для контейнера переопределяются в `environment`.

```bash
docker compose exec backend python -m scripts.users create alice          # пароль спросит интерактивно
docker compose exec backend python -m scripts.users set-password alice
docker compose exec backend python -m scripts.users deactivate alice      # / activate
docker compose exec backend python -m scripts.users list
```

## Keitaro

Бекенд ходит в Keitaro Admin API v1 (`{KEITARO_URL}/admin_api/v1`, заголовок `Api-Key`) через
`app/keitaro/client.py`. Разведка, эндпоинты и реальные ответы инстанса —
[.workspace/keitaro-spec/](.workspace/keitaro-spec/README.md).

| Переменная | Назначение |
|---|---|
| `KEITARO_URL` | Адрес трекера; путь отбрасывается (`tlgk.host/admin` → `https://tlgk.host`) |
| `KEITARO_API_KEY` | API-ключ (Профиль → API ключи). Без него ручки Keitaro отвечают 503 |
| `KEITARO_TIMEZONE` | Таймзона отчётов, по умолчанию `Europe/Moscow` |
| `KEITARO_DEFAULT_DOMAIN_ID`, `_GROUP_ID`, `_TRAFFIC_SOURCE_ID` | Значения формы создания по умолчанию |
| `KEITARO_GEO_REDIRECT_URL` | Куда уводит гео-поток, по умолчанию `https://google.com` |

Перед трекером Cloudflare, который банит дефолтные User-Agent HTTP-библиотек, поэтому клиент
шлёт браузерный.

### API кампаний

Все ручки требуют `Authorization: Bearer`. `{id}` — id кампании в Keitaro.

- `GET /api/campaigns/form-options` → домены, группы кампаний, источники и значения по умолчанию
- `GET /api/offers?q=&limit=20` → поиск по всей базе офферов Keitaro (без архивных): каждое слово
  запроса ищется в id, имени, группе, стране и партнёрке; сначала точное совпадение id, затем префикс id
  Оффер из группы, закрытой ключу (`GET /offers/{id}` → 403), находится только по точному id и
  приходит с `hidden: true` и именем `#id`: его можно поставить в поток и указать при создании кампании,
  при синке он не считается удалённым (`offer_deleted` — только для 404 и архивных)
- `POST /api/campaigns` `{name, geo, offer_id, domain_id?, group_id?, traffic_source_id?}` → 201.
  `geo` — список ISO-кодов или строка `"MX,AU"`. Создаёт кампанию (ротация по позиции, CPC 0) и
  два потока: `geo → KEITARO_GEO_REDIRECT_URL` (фильтр `country` accept) и «все остальные → оффер 100%».
  Если поток не создался, кампания уходит в архив Keitaro, ответ 502.
  В Keitaro имя получает префикс автора: пользователь `admin`, имя `promo` → `test_admin_promo`;
  обёртка показывает имя без префикса
- `GET /api/campaigns` → кампании, созданные через обёртку (таблица `campaigns`)
- `GET /api/campaigns/{id}?period=all_time` → кампания, потоки, черновик офферов (`draft`) и статистика
  «клики / уники / боты» (`clicks` / `stream_unique_clicks` / `bots` из `/report/build`) по кампании,
  потоку и офферу. `period` — интервалы Keitaro: `today`, `yesterday`, `7_days_ago`, `1_month_ago`, ...

#### Редактор офферов: черновик и push

Офферы потока `landings` правятся как черновик в таблице `flow_offers`; Keitaro не меняется,
пока не нажат push. Все ручки ниже отвечают черновиком потока `StreamDraft`
`{stream_id, offers, removed, dirty, total_share}`. Префикс — `/api/campaigns/{id}/streams/{stream_id}`.

- `POST …/offers` `{offer_id}` — добавить оффер (удалённый — вернуть); дубль — 409, архивный — 422
- `DELETE …/offers/{offer_id}` — убрать в список удалённых; последний оффер — 409
- `POST …/offers/{offer_id}/restore` — вернуть удалённый; удалённый в Keitaro оффер — 409
- `PATCH …/offers/{offer_id}` `{share}` — ручная доля 0..100, оффер закрепляется (pin);
  `{pinned}` — закрепить текущую долю / открепить. Закреплённую долю менять нельзя (409) — сначала открепить
- `POST …/push` — заменить офферы потока в Keitaro черновиком; сумма долей ≠ 100 — 409
- `POST …/reset` — откатить непушнутые изменения к состоянию Keitaro (добавленные и не пушнутые
  офферы выбрасываются, список удалённых сохраняется)

Доли в обёртке точные (дробные) с суммой 100. Закреплённые офферы сохраняют долю, остальные делят
остаток ровно поровну (3 оффера → 100/3 каждому; 60 закреплено → 20/20). Keitaro принимает только целые
проценты: на push уходит доля, округлённая вниз (33/33/33 — Keitaro выбирает оффер по весу, так что
поровну); статус `synced` — когда округление вниз совпадает с долей в Keitaro. Целые доли из Keitaro,
равные округлению ровного деления (33/33/33), читаются обратно как точные 100/3. В UI доля показана
округлённой вниз, при редактировании — точной (33.33). Пересчёт — при добавлении, удалении,
возврате, ручной доле и откреплении. Если закреплено всё и сумма ≠ 100, push запрещён.

Статус оффера `sync`: `synced`, `new` (добавится), `changed` (в Keitaro другая доля, `keitaro_share`),
`removed` (удалится). `dirty` — есть несинхронизированные офферы; в UI поток подсвечен жёлтым.

Синхронизация с Keitaro при каждой загрузке кампании (и перед push/reset): новые офферы потока из
Keitaro добавляются; пропавшие из потока в Keitaro уходят в удалённые со `state: "deleted"`;
офферы без локальных правок принимают долю из Keitaro; `offer_deleted` — сам оффер удалён/архивирован
в Keitaro или не виден ключу. Удалённые офферы хранятся всегда, их можно вернуть в любой момент.

Трекер общий, поэтому редактор работает только с кампаниями из своей таблицы `campaigns`:
чужие → 404. Ошибки Keitaro отдаются как 502 `{"detail": "Keitaro: ..."}`, отсутствующий в Keitaro
объект — 404.

## Запуск и разработка

Всё запускается только в Docker, локальные venv / `npm install` не нужны.
Первый запуск — см. [README](README.md).

Тесты и линтеры (при запущенном стеке):

```bash
docker compose exec backend pytest
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

Оба приложения работают с hot reload: исходники смонтированы в контейнеры.

- `backend` — `uvicorn --reload`, перезапускается при изменениях в `backend/app/`
- `frontend` — Vite dev server с HMR
- `nginx` — единственный конфиг `nginx/nginx.conf`: `/api` проксирует на backend,
  остальное (включая websocket HMR) — на Vite. После правки: `docker compose restart nginx`.

Файловые события с Windows/macOS в контейнер доходят ненадёжно, поэтому слежение
работает через polling (`WATCHFILES_FORCE_POLLING`, `VITE_WATCH_POLLING`).
После изменения зависимостей пересоберите образ: `docker compose up --build`
(`node_modules` фронтенда живёт в анонимном томе — при необходимости добавьте `-V`).
