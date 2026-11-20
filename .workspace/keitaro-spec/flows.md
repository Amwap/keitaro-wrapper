# Сценарии поверх Keitaro API

Детали эндпоинтов — в [endpoints.md](endpoints.md). Значения id — с инстанса `tlgk.host` (см. [investigation.md](investigation.md)).

## 1. Создание кампании

Вход: `name`, `geo` (код страны или список, напр. `AU` / `MX,AU,RO`), `offer_id`;
`domain_id` / `group_id` / `traffic_source_id` — из формы, по умолчанию `1813 kylovoa.com` / `10332 FORTESTS` / `836 FORTESTS`.

1. Валидация на нашей стороне: `geo` — ISO 3166-1 alpha-2 (верхний регистр), оффер есть в справочнике,
   домен/группа/источник есть в справочниках.
2. `POST /campaigns`: `name`, `alias` (slug имени + короткий hex-суффикс — так делают остальные, `alias` уникален
   на инстансе), `type: "position"`, `domain_id`, `group_id`, `traffic_source_id`, `cost_type: "CPC"`, `cost_value: 0`.
3. `POST /streams` — поток 1 «гео → Google»: `type: "regular"`, `position: 1`, `schema: "redirect"`,
   `action_type: "http"`, `action_payload: "https://google.com"`,
   `filters: [{name: "country", mode: "accept", payload: [geo...]}]`.
4. `POST /streams` — поток 2 «оффер»: `type: "regular"`, `position: 2`, `schema: "landings"`, `action_type: "http"`,
   `offers: [{offer_id, share: 100, state: "active"}]`. Фильтров нет — ловит всех, кого не забрал поток 1.
5. Ответ: кампания + URL `{campaign.domain}{alias}` (`https://kylovoa.com/<alias>`).

Атомарности в API нет: если шаг 3 или 4 упал — удалить кампанию (`DELETE /campaigns/{id}`, уходит в архив)
и вернуть ошибку.

Инстанс общий: имя по умолчанию с префиксом `test_<фамилия>_`, id созданных кампаний хранить у себя в БД —
редактор работает только с ними.

## 2. Редактор кампании

1. Список кампаний — наши (из БД) с данными из `GET /campaigns/{id}`.
2. Открыть кампанию — `GET /campaigns/{id}` + `GET /campaigns/{id}/streams` + статистика (п. 3).
   Редактируемый поток — поток со `schema = "landings"` (в нём `offers[]`).
3. Добавить оффер — новый массив `offers` = текущие + `{offer_id, share}`; пересчитать доли; `PUT /streams/{id}`.
4. Удалить оффер — убрать из массива, пересчитать доли оставшихся, `PUT /streams/{id}`.
5. После записи перечитать поток (`GET /streams/{id}`) и показывать то, что вернул Keitaro.

Пересчёт долей (гипотеза до разбора видео): поровну, целыми процентами, сумма строго 100 —
`base = 100 // n`, остаток `100 - base*n` раздаётся по +1 первым офферам (3 оффера → 34/33/33).
Эталонные кампании — 2 оффера по 50% — согласуется. Нельзя удалять последний оффер.

Ограничение инстанса: в справочнике виден один оффер (18813), так что добавить второй *другой* оффер нечем.
Варианты — уточнить у заказчика доступ к офферам; допускает ли Keitaro один оффер дважды в потоке **[проверить]**.

## 3. Статистика («верные цифры»)

`POST /report/build`:

```json
{
  "range": {"interval": "all_time", "timezone": "Europe/Moscow"},
  "grouping": ["stream_id", "offer_id"],
  "metrics": ["clicks", "stream_unique_clicks", "bots"],
  "filters": [{"name": "campaign_id", "operator": "EQUALS", "expression": 211913}]
}
```

Колонки UI «Клики / Уник. / Боты» = `clicks` / `stream_unique_clicks` / `bots` по потоку; с группировкой по
`offer_id` — разбивка по офферам внутри потока. Проверено на кампании 211913: совпадает с тем, что админка
получает через `reports.statsForCampaign`. Таймзона — как в настройках трекера (`Europe/Moscow` у офферов).
