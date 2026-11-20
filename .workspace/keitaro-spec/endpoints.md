# Keitaro Admin API — используемые эндпоинты

Базовый URL: `https://tlgk.host/admin_api/v1`. Заголовки: `Api-Key: <KEITARO_API_KEY>`,
`Content-Type: application/json`, браузерный `User-Agent` (Cloudflare банит дефолтные UA библиотек).
Полная спецификация — [openapi.json](openapi.json).

**[проверено]** — подтверждено ответом инстанса (через внутренний API админки, см. ниже и [samples/admin/](samples/admin/)).
**[проверить]** — выведено из спецификации, нужен запрос к живому инстансу.

## Внутренний API админки (альтернатива без ключа)

`https://tlgk.host/admin/?object=<resource>.<method>`, авторизация cookie `states` после
`POST /admin/?object=auth.login` с `{"login","password"}` → `{"success":true}`. Чтение — `GET` с query-параметрами,
запись — `POST` с JSON. UI шлёт вызовы пачкой в `POST /admin/?batch`, но каждый работает и по отдельности.
Модели ответов те же, что в Admin API v1.

| Admin API v1 | Внутренний API |
|---|---|
| `GET /campaigns` | `campaigns.index` (проверено) |
| `GET /campaigns/{id}` | `campaigns.show&id=` (проверено) |
| `POST /campaigns` | `campaigns.create` |
| `GET /campaigns/{id}/streams` | `streams.index&campaign_id=` (проверено) |
| `GET /streams/{id}` | `streams.show&id=` |
| `POST /streams` | `streams.createInCampaign` |
| `PUT /streams/{id}` | `streams.update` |
| `GET /domains` | `domains.index` (проверено) |
| `GET /groups?type=` | `groups.listAsOptions&type=` (проверено) |
| `GET /traffic_sources` | `trafficSources.index` (проверено) |
| `GET /offers` | `offers.index`, `offers.listAsOptions` (проверено) |
| `GET /stream_filters` | `streamFilters.filters` (проверено) |
| `GET /streams_actions` | `streamActions.index` (проверено) |
| `GET /stream_schemas` | `streamSchemas.listAsOptions` (проверено) |
| `POST /report/build` | `reports.build` (проверено) |
| — | `reports.statsForCampaign` — статистика по потокам, как в UI (проверено) |

## Ошибки

| Код | Тело | Когда |
|---|---|---|
| 400 | `{"error": "..."}` | Некорректный запрос |
| 401 | `{"error": "Invalid API key"}` | Нет/неверный ключ (проверено на инстансе) |
| 402 | `{"error": "..."}` | Admin API недоступен в этой редакции Keitaro |
| 404 | — | Объект не найден |
| 406 | `{"error": "..."}` | Невалидные поля |
| 500 | `{"error": "..."}` | Внутренняя ошибка |

## Справочники (для формы создания)

### `GET /domains`
Массив `Domain`: `id`, `name` (на инстансе доступен один: `kylovoa.com`, id 1813 **[проверено]**), `state` (`active|deleted`), `is_ssl`, `network_status`,
`status`, `default_campaign_id`, `campaigns_count`, `group_id`, `group`.
В форме — только `state = active`. URL кампании = `http(s)://{name}/{campaign.alias}`.

### `GET /groups?type=campaigns`
`type` обязателен (без него `400 Param 'type' is required` **[проверено]**): `campaigns | offers | landings | domains`.
Массив `Group`: `id`, `name`, `position`, `type`. Группа `FORTESTS` — id 10332.

### `GET /traffic_sources`
Массив `Source`: `id`, `name`, `state`, `template_name`, `parameters`, `postback_url`, ...
Доступен один: `FORTESTS`, id 836 **[проверено]**.

### `GET /offers`
Массив `Offer` (без пагинации и фильтров в API): `id`, `name`, `group_id`, `state`, `country[]`,
`affiliate_network_id`, `affiliate_network`, `payout_value`, `payout_currency`, `payout_type`,
`action_type`, `action_payload`.
Пользователю виден один оффер — 18813 (доступ `read_only`) **[проверено]**; в потоках чужих кампаний
встречаются офферы, которых нет в списке — имя для них брать неоткуда, показывать `#id`.
Внутренний `offers.listAsOptions` отдаёт облегчённый вариант: `value`, `name`, `group_id`, `group`.
Автокомплит — фильтровать на нашем бэкенде (по `id` и подстроке `name`), можно кэшировать на короткое время.
`GET /offers/{id}` — один оффер.

### Метаданные потоков
- `GET /stream_filters` — фильтры: `value` (имя, напр. `country`), `modes` (`accept`/`reject`), `group`, `defaults`.
  Для страны: `value: "country"`, `group: "filters.groups.geo"` **[проверено]**.
- `GET /streams_actions` — значения `action_type` (`StreamAction`: `key`, `name`, `type`, `field`).
  Редиректы: `http`, `meta`, `js`, `blank_referrer`, `curl`, `double_meta`, `formsubmit`, `iframe`, `remote`, `frame`, ... **[проверено]**.
- `GET /stream_schemas` — `landings | redirect | action`.
- `GET /stream_types` — `forced | regular | default`.

## Кампании

### `GET /campaigns?offset=&limit=`
Массив `Campaign` (ниже). `GET /campaigns/deleted` — архив.

### `GET /campaigns/{id}`
`Campaign`:

| Поле | Тип | Примечание |
|---|---|---|
| `id` | int | |
| `alias` | string | Идентификатор в URL (`wVqN1R` на скриншоте) |
| `name` | string | |
| `type` | `position \| weight` | Ротация потоков, по умолчанию `position` |
| `state` | `active \| disabled \| deleted` | |
| `group_id` | int | Группа кампании |
| `traffic_source_id` | int | Источник |
| `cost_type`, `cost_value`, `cost_currency`, `cost_auto` | | Модель затрат (на скриншоте CPC, 0 USD) |
| `cookies_ttl` | int | По умолчанию 24 ч |
| `bind_visitors` | `s \| sl \| slo \| null` | |
| `token` | string | Для Click API (секрет — в samples вычищен) |
| `domain_id` | int | Есть в ответе, хоть и не описан в схеме **[проверено]** |
| `domain` | string | Полный URL домена: `https://kylovoa.com/` **[проверено]** |
| `group` | string | Имя группы **[проверено]** |
| `uniqueness_method`, `uniqueness_use_cookies`, `traffic_loss`, `bypass_cache` | | Есть в ответе, не в схеме |
| `parameters` | `SourceParameters` | sub_id_1..15, keyword, cost, ... |
| `postbacks`, `notes`, `created_at`, `updated_at` | | |

URL кампании = `domain` + `alias` (`https://kylovoa.com/test-kotovsky-campaign1-3c25e9d1`).

### `POST /campaigns`
Тело `CampaignRequest`, обязательны `name` и `alias` (по схеме; в описании `alias` — «оставьте пустым для
автогенерации» — **[проверить]**; другие кандидаты генерируют сами: slug имени + hex-суффикс). Нужные нам поля:

```json
{
  "name": "My campaign",
  "alias": "aB3dE9",
  "type": "position",
  "state": "active",
  "domain_id": 1813,
  "group_id": "10332",
  "traffic_source_id": 836,
  "cost_type": "CPC",
  "cost_value": 0,
  "cost_currency": "USD"
}
```

`group_id` в схеме запроса — string, в ответе — int. Ответ — `Campaign`.

### `PUT /campaigns/{id}`
Частичное обновление полями `CampaignRequest`. Ответ — `Campaign`.

### Прочее
`DELETE /campaigns/{id}` — в архив, `POST /campaigns/{id}/restore`, `/enable`, `/disable`, `/clone`.

## Потоки (streams / flows)

### `GET /campaigns/{id}/streams`
Массив `Stream`:

| Поле | Тип | Примечание |
|---|---|---|
| `id`, `campaign_id`, `name` | | |
| `type` | `forced \| regular \| default` | forced — перехватывающий, проверяется первым; default — «все остальные». Эталонные кампании используют `regular` для обоих потоков **[проверено]** |
| `schema` | `landings \| redirect \| action` | `redirect` — сразу на URL, `landings` — лендинги/офферы |
| `action_type` | string | Для `redirect`: напр. `http` (302), `meta`, `js`... — из `/streams_actions` |
| `action_payload` | string \| object | Для `redirect` — URL (`https://google.com`); для `landings` — `null` |
| `action_options` | object | |
| `position`, `weight` | int, number | |
| `state` | `active \| disabled \| deleted` | |
| `filter_or` | bool | OR между фильтрами вместо AND |
| `filters[]` | `Filter` | `id`, `stream_id`, `name`, `mode`, `payload` (массив, напр. `["AU"]`), `oid` **[проверено]** |
| `offers[]` | `OfferStream` | `id`, `stream_id`, `offer_id`, `state`, `share`, `created_at`, `updated_at` |
| `landings[]` | `LandingStream` | |
| `triggers[]`, `collect_clicks`, `offer_selection`, `comments`, `updated_at` | | |

`share` — целые проценты трафика оффера в потоке (эталон: два оффера по 50) **[проверено]**.

### `GET /streams/{id}`
Один `Stream`.

### `POST /streams`
Тело `StreamObject`, обязательны `campaign_id`, `schema`, `type`, `name`, `action_type`.

Фильтр (`FilterStreamRequest`): `name` (из `/stream_filters`), `mode` (`accept|reject`), `payload` — массив строк,
`id` — при обновлении существующего фильтра.

Оффер (`OfferStreamRequest`): `offer_id`, `share` (int, %), `state` (`active|disabled`).

Поток «гео → Google»:

```json
{
  "campaign_id": 123,
  "name": "Geo AU → Google",
  "type": "regular",
  "position": 1,
  "schema": "redirect",
  "action_type": "http",
  "action_payload": "https://google.com",
  "filters": [{"name": "country", "mode": "accept", "payload": ["AU"]}]
}
```

Поток с оффером:

```json
{
  "campaign_id": 123,
  "name": "Offers",
  "type": "regular",
  "position": 2,
  "schema": "landings",
  "action_type": "http",
  "offers": [{"offer_id": 18813, "share": 100, "state": "active"}]
}
```

Значения `type`, `schema`, `action_type`, фильтр `country` и формат `payload` совпадают с потоками
чужих кампаний (`samples/admin/streams.index.211913.json`) **[проверено]**. Тело запроса на создание — **[проверить]**.

### `PUT /streams/{id}`
Тело `StreamObject` (частичное). Для редактора офферов — передавать полный новый массив `offers`.
**[проверить]**: массив заменяется целиком (отсутствующие офферы удаляются), нужно ли передавать `id`
у существующих связок, валидирует ли Keitaro сумму `share`.

### Прочее
`DELETE /streams/{id}`, `/enable`, `/disable`, `/restore`, `GET /streams/search`, `GET /stream/{id}/events`.

## Статистика

### `POST /report/build`
Схема `ReportsRequest` описывает тело как `range`, `dimensions`, `measures`, ..., но реально работают
`range`, `grouping`, `metrics`, `filters`, `sort`, `limit` **[проверено]** (через `reports.build`).

Статистика кампании по потокам и офферам:

```json
{
  "range": {"interval": "all_time", "timezone": "Europe/Moscow"},
  "grouping": ["stream_id", "offer_id"],
  "metrics": ["clicks", "stream_unique_clicks", "bots"],
  "filters": [{"name": "campaign_id", "operator": "EQUALS", "expression": 123}]
}
```

Ответ: `{"rows": [{"stream_id": 1310509, "offer_id": 10184, "clicks": 13, "stream_unique_clicks": 1, "bots": 0}], "total": 1}`
**[проверено]**. Колонки UI «Клики / Уник. / Боты» = `clicks` / `stream_unique_clicks` / `bots`.

### Внутренний `reports.statsForCampaign`
`POST /admin/?object=reports.statsForCampaign` с
`{"campaign_id": 211913, "range": {"interval": "all_time", "timezone": "Europe/Moscow"}}` →
`{"1310509": {"clicks": 13, "stream_unique_clicks": 1, "bots": 0}}` — то, что UI показывает у потоков;
поток без кликов может прийти ключом `"null"`. Совпадает с `reports.build` **[проверено]**.
В Admin API v1 аналога нет — использовать `/report/build` с группировкой по `stream_id`.

`range.interval`: `today, yesterday, 7_days_ago, first_day_of_this_week, 1_month_ago, first_day_of_this_month,
1_year_ago, first_day_of_this_year, all_time`, либо `from`/`to` (`YYYY-MM-DD`) + `timezone`.

Метрики (основные): `clicks`, `campaign_unique_clicks`, `stream_unique_clicks`, `global_unique_clicks`, `bots`,
`bot_share`, `conversions`, `leads`, `sales`, `cr`, `epc`, `cost`, `revenue`, `profit`, `roi`.

Группировки (основные): `campaign_id`, `campaign`, `stream_id`, `stream`, `offer_id`, `offer`, `landing_id`,
`country_code`, `country`, `ts_id`, `ts`, `day`, `hour`.

Операторы фильтров: `EQUALS`, `NOT_EQUAL`, `GREATER_THAN`, `LESS_THAN`, `EQUALS_OR_GREATER_THAN`,
`EQUALS_OR_LESS_THAN`, `MATCH_REGEXP`, `NOT_MATCH_REGEXP`, `BEGINS_WITH`, `ENDS_WITH`, `CONTAINS`,
`NOT_CONTAIN`, `IN_LIST`, `NOT_IN_LIST`, `BETWEEN`, `IS_SET`, `IS_NOT_SET`, `IS_TRUE`, `IS_FALSE`, `HAS_LABEL`, `NOT_HAS_LABEL`.
