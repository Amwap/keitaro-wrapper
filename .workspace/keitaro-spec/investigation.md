# Разведка инстанса Keitaro

Снято 2026-11-19 через [tools/kproxy.py](tools/kproxy.py), только читающими запросами. Ответы — в [samples/admin/](samples/admin/).

## Доступ

| Что | Результат |
|---|---|
| Базовый URL | `https://tlgk.host` (в `.env` `KEITARO_URL=tlgk.host/admin` — без схемы и с путём, нормализовать в коде) |
| Cloudflare | Банит дефолтные User-Agent HTTP-библиотек (`Python-urllib` → `403 error 1010 browser_signature_banned`). Клиенту нужен браузерный `User-Agent` |
| Вход в админку | `POST /admin/?object=auth.login` с JSON `{"login","password"}` → `{"success":true}` + cookie `states` (JWT, ~30 дней) |
| Внутренний API админки | `/admin/?object=<resource>.<method>` по cookie — работает, им сняты все samples |
| Admin API v1 (`/admin_api/v1`) | Только заголовок `Api-Key`; cookie сессии не принимает (`401 Invalid API key`). Ключа пока нет |
| `.env` | CRLF — значения надо `strip()`-ать |

## Права пользователя (`profile.currentAccess`)

| Ресурс | Доступ |
|---|---|
| Кампании | `created_by_user_groups_and_selected` — свои + группы из списка (в т.ч. `FORTESTS`) |
| Потоки, отчёты, группы | `full_access` |
| **API-ключи** | `full_access` — можно создать ключ для Admin API (в профиле админки) |
| Офферы | `read_only`, группы `15 DEFAULT IGNORE`, `7183 GAK JO Flexacil PE` |
| Домены | только `1813` |
| Источники трафика | только `836` |

## Что есть на инстансе

- **Инстанс общий для кандидатов**: 422 видимые кампании, почти все — чужие тестовые (`test_<фамилия>_...`),
  225 в группе `FORTESTS`, 109 — в `VZ adrobot test`. Кампании `campaign 2` из ТЗ среди видимых нет.
  ⇒ свои кампании называть с префиксом (`test_<фамилия>_...`), чужие не трогать, в редакторе показывать
  только свои (фильтр по группе / префиксу / сохранённым у нас id).
- **Домен**: один — `kylovoa.com` (id 1813, SSL). `in.posdk.xyz` со скриншота ТЗ недоступен.
- **Группа кампаний** `FORTESTS` — id 10332 (+ 15 других групп кандидатов). `groups.listAsOptions` требует `type`.
- **Источник** `FORTESTS` — id 836, единственный.
- **Офферы**: виден один — `18813 Flexacil [JOINT-PE] [vsl es -] ReactJs v4` (страна Перу, `local_file`).
  При этом в чужих кампаниях стоят офферы `10184`, `19958`, которых в нашем списке нет — Keitaro отдаёт
  их id в потоке, но не в `offers.index`. Имена таких офферов показать не сможем — показывать `#id`.
- **Фильтр страны**: `country`, режимы `accept`/`reject`, `payload` — массив ISO-кодов (`["AU"]`, `["JP"]`).
- **Действия редиректа**: `http`, `meta`, `js`, `blank_referrer`, `curl`, `double_meta`, ... — чужие кампании
  используют `http`.

## Эталонная структура кампании (снята с чужих кампаний, совпадает со скриншотом ТЗ)

Кампания 211913 (`streams.index.211913.json`):

| Поток | type | schema | Действие | Фильтры | Офферы |
|---|---|---|---|---|---|
| 1 `Google` | `regular` | `redirect` | `http` → `https://www.google.com` | `country` accept `["AU"]` | — |
| 2 `Offers` | `regular` | `landings` | `http`, payload `null` | — | `10184` 50%, `19958` 50% |

Кампания: `type: "position"`, `cost_type: "CPC"`, `cost_value: 0`, `cost_currency: "USD"`, `domain_id: 1813`,
`group_id`, `traffic_source_id: 836`. `alias` кандидаты генерируют сами (`test-kotovsky-campaign1-3c25e9d1`).
URL кампании = `domain` (`https://kylovoa.com/`) + `alias`.

## Статистика — проверено

- `reports.statsForCampaign {campaign_id, range}` → `{ "<stream_id>": {clicks, stream_unique_clicks, bots} }` —
  ровно колонки «Клики / Уник. / Боты» из UI потоков. Если у потока нет кликов, ключ может быть `"null"`.
- `reports.build` с `grouping` + `metrics` + `filters` работает (не `dimensions`/`measures`, как в схеме OpenAPI).
- Для 211913 оба способа совпали: поток 1310509 — 13 кликов, 1 уник., 0 ботов (по офферу 10184).
- Кампаний с кликами всего 21, максимум 13 кликов — проверять «верные цифры» придётся на своём трафике
  (переходы по URL своей кампании).

## Не проверено (нужна запись)

- Точное тело `campaigns.create` / `streams.createInCampaign` / `streams.update` (или их аналоги в Admin API).
- Заменяет ли обновление потока массив `offers` целиком; валидирует ли Keitaro сумму `share` = 100.
- Логика редактора из видео (https://youtu.be/jNloscEWCjA) — ещё не разобрана.

## Решение по транспорту для бэкенда

| Вариант | Плюсы | Минусы |
|---|---|---|
| **A. Admin API v1 + `Api-Key`** (рекомендую) | Документирован ([openapi.json](openapi.json)), стабилен, ТЗ про него | Нужно один раз создать ключ в профиле (права есть) |
| B. Внутренний API админки по логину/паролю | Работает уже сейчас | Недокументирован, сессии/cookie, может меняться между версиями |

Для A нужен `KEITARO_API_KEY` в `.env`. Пути и поля Admin API v1 совпадают с внутренним API
(те же модели: `Campaign`, `Stream`, `filters`, `offers[].share`), так что samples применимы к обоим.

## Следующие шаги

1. Создать API-ключ (Профиль → API ключи) — вручную или через прокладку, с вашего согласия — и положить
   в `.env` как `KEITARO_API_KEY`; снять `GET`-ами те же данные через Admin API v1 в `samples/api/`.
2. Разобрать видео редактора → `.workspace/techtask/editor.md`.
3. Один пишущий цикл на своей тестовой кампании `test_<фамилия>_spec_probe`: создать → 2 потока →
   добавить/удалить оффер → в архив. Зафиксировать реальные тела запросов/ответов в `samples/`.
4. Перенести эндпоинты в `SPEC.md`, к этапу 3 (бэкенд).
