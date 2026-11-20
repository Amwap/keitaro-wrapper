# Ответы инстанса Keitaro

Сняты 2026-11-19 через [../tools/kproxy.py](../tools/kproxy.py), только чтение. `token` и прочие секреты вычищены.

`admin/` — внутренний API админки (`/admin/?object=<имя файла>`):

| Файл | Что |
|---|---|
| `campaigns.index.json` | Все видимые кампании (422, почти все — чужие тестовые) |
| `campaigns.show.211913.json` | Одна кампания — эталон полей |
| `streams.index.211913.json` | Эталон: поток `country=AU` → google + поток с офферами 50/50 |
| `streams.index.2148{92,93,95}.json` | Ещё примеры потоков (свежие кампании, один оффер 100%) |
| `domains.index.json` | Домены (доступен один — `kylovoa.com`) |
| `groups.campaigns.json`, `groups.offers.json` | Группы кампаний / офферов |
| `trafficSources.index.json` | Источники (один — `FORTESTS`) |
| `offers.index.json`, `offers.listAsOptions.json` | Офферы (доступен один — 18813) |
| `streamFilters.filters.json` | Все фильтры потоков (`country` и др.) |
| `streamActions.index.json`, `streamSchemas.listAsOptions.json` | Действия и схемы потоков |
| `campaigns.costTypes.json` | Модели затрат |
| `profile.currentAccess.json` | Права текущего пользователя |
| `reports.statsForCampaign.*.json`, `reports.build.*.json` | Статистика по потокам / офферам |
| `reports.build.campaigns_with_clicks.json` | Кампании, у которых есть клики |
