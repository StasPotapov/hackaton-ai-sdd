# Ресёрч исполнимости: GigaSpec на Ouroboros (02.07.2026)

> Проверка по коду Ouroboros (`/Users/stasp/dev/ouroboros`, v6.54.2, [github.com/razzant/ouroboros](https://github.com/razzant/ouroboros)) + интернет-ресёрч внешних зависимостей.
> **Вердикт: идея исполнима целиком на штатных механизмах.** Красных блокеров нет. Главная неопределённость — Jazz API.

## 1. Что подтверждено в Ouroboros (по коду, не по README)

| Нужно нам | Статус | Где / как |
|---|---|---|
| Скилл типа `extension` (SKILL.md + plugin.py) | ✅ | `docs/CREATING_SKILLS.md`; PluginAPI: `register_tool / register_route / register_ws_handler / register_ui_tab / register_settings_section / companion_process / subscribe_event`; frozen ABI в `ouroboros/contracts/plugin_api.py` |
| `scheduled_tasks` (cron) в манифесте | ✅ с оговоркой | 5-field cron + IANA timezone, один catch-up после простоя. **Оговорка v1:** это «напоминание агенту» запустить задачу скилла, а не детерминированный вызов скрипта — агент сам выбирает `skill_exec`. Нужен permission `supervised_task`. Есть и CLI: `ouroboros schedule add --cron` |
| Встроенный MCP-клиент | ✅ с оговоркой | `ouroboros/mcp_client.py:41` — **только `streamable_http` и `sse`, stdio НЕТ**. Авторизация: один header + token; тулзы видны агенту как `mcp_<server>__<tool>`; выключен по умолчанию (Settings → Advanced), есть `allowed_tools`-фильтр |
| telegram-bridge | ✅ | Не в базовом рантайме — reviewed-скилл из [OuroborosHub](https://github.com/razzant/OuroborosHub). `TELEGRAM_BOT_TOKEN` — защищённый ключ (грант владельца). Transport-скиллы — «first-class control surface»: long-lived poller, все owner-команды, owner/chat binding |
| `ui_tab` (доска процесса) | ✅ | Декларативные компоненты: `table, chart, kanban, kv, status, tabs, progress, markdown, form, poll…` — **kanban есть штатно**; либо `kind: module` (widget.js в sandbox-iframe). Валидация схемы хостом |
| Учёт стоимости токенов | ✅ | `ouroboros/pricing.py` — usage events, live-прайсинг, **тарифы GigaChat и Cloud.ru в рублях зашиты**; budget tracking в `data/state/`; `/status` показывает разбивку бюджета |
| Субагенты, model lanes, worktree | ✅ | Lanes Main/Heavy/Light/Vision (README §Default Models); `subagents.py`, `subagent_worktrees.py` (изоляция acting в git-worktree), workspace-runs с patch-артефактами (`ouroboros run --workspace … --patch-out`) — этап кода из коробки |
| Провайдеры GigaChat / Cloud.ru | ✅ | `ouroboros/llm.py` — OpenRouter / OpenAI / compatible / Cloud.ru / **GigaChat (lib `gigachat`, OAuth)** / Anthropic; GigaChat-only режим нормализуется out of the box |
| Human-in-the-loop | ✅ частично | Штатно: task-result review mode, per-task owner mailbox, гранты владельца на ключи/permissions. **Отдельного примитива «апрув diff» нет** — делаем через чат (diff сообщением → «ок» владельца). Это нормально и дёшево |
| Состояние вне LLM-сессии | ✅ | `data/state/` (state.json, file locking), per-skill state dir + job dirs, durable project journal, projects registry |

## 2. Ограничения платформы (важно учесть)

1. **Ревью-гейт скиллов**: перед enable — три-модельное LLM-ревью; любая правка payload инвалидирует вердикт. **Спасение для хакатона:** owner attestation «⚠️ Skip review» для external/self-authored скиллов (детерминированный preflight всё равно бежит). Итерация: `skill_preflight` → правка → attest.
2. **Таймаут тулзы**: default 60с, hard cap **300с** — длинный пайплайн оформлять как задачи агента, не как один tool call.
3. **MCP без stdio** → mcp-atlassian хостим отдельно как HTTP-сервис (Docker), Ouroboros подключается по URL.
4. **Out-of-process extensions** (с isolated deps): нет `subscribe_event`/`supervised_task` в per-call child — длинные фоновые вещи только через `companion_process`; `send_ws_message` ~60/мин.
5. **Каждый tool call проходит LLM safety-check** (light-модель) — латентность и токены; закладываем в тайминг демо и в лимит $300.
6. **Single-owner модель**: приложение рассчитано на одного владельца; командный сценарий идёт через transport-скилл (Telegram-группа), команды принимаются с owner/chat binding — проверить, как в мосте разруливаются сообщения «не-владельцев» (для фичи «завёл задачу из чата команды»).

## 3. Внешние зависимости

### MCP Atlassian — 🟢
[sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian): поддерживает **Jira/Confluence Server и Data Center через PAT** (не только Cloud), транспорты SSE (`/sse`) и streamable-http (`/mcp`) — ровно то, что ест MCP-клиент Ouroboros. Тулзы: JQL-поиск, создание/обновление задач, комментарии, страницы Confluence; multi-user per-request auth. Официальный Atlassian Remote MCP (mcp.atlassian.com) — Cloud-only, для внутреннего контура не подходит. Источники: [GitHub](https://github.com/sooperset/mcp-atlassian), [PyPI](https://pypi.org/project/mcp-atlassian/), [HTTP transport docs](https://personal-1d37018d.mintlify.app/docs/http-transport).

### SaluteJazz — 🟡 (главная неопределённость)
REST API официально существует: методы для **комнат, токенов, видеозаписей и транскрипций** ([обзор](https://developers.sber.ru/docs/ru/jazz/api/overview), [reference](https://developers.sber.ru/docs/ru/jazz/api/reference/salutejazz-api)). Авторизация двухступенчатая: транспортный токен генерится бэкендом на основе [ключа SDK](https://developers.sber.ru/docs/ru/jazz/sdk/sdk-key) → access token. То есть **нужен SDK-ключ / корпоративная лицензия**, а полный список методов скрыт в SPA-доке — проверить изнутри контура. **Fallback для демо (безопасный):** ручная выгрузка расшифровки встречи (файл/текст боту) — фича 1 работает без API.

### GigaChat — 🟢/🟡
Function calling поддержан ([ai-forever/gigachat](https://github.com/ai-forever/gigachat), [litellm docs](https://docs.litellm.ai/docs/providers/gigachat)); GigaChat-2-Max — 128K контекста. Ограничение: **один function call за запрос** — для тулз-лупа Ouroboros приемлемо (он и так шагает по одному), но качество агентного цикла на GigaChat относительно Claude/GPT — проверить на реальных прогонах. Тарифы ([developers.sber.ru](https://developers.sber.ru/docs/ru/gigachat/tariffs)) уже вшиты в pricing.py Ouroboros.

### Telegram Bot API — 🟢
Сценарий «тегнули бота в группе → завёл задачу» штатный: в группах с privacy mode бот получает команды/упоминания/реплаи — для срабатывания по тегу это ровно то, что нужно ([privacy mode](https://core.telegram.org/bots/features#privacy-mode)). telegram-bridge Ouroboros уже готовый.

### Jira DC мониторинг без вебхуков — 🟢
Поллинг JQL `updated >= "-15m"` по cron — стандартная практика; rate limiting в DC по умолчанию выключен/настраивается админом. Не проверял в интернете глубоко — уточнить лимиты конкретного инстанса на месте.

## 4. Куда сконцентрировать внимание (по убыванию риска)

1. **Jazz API** — достать SDK-ключ/доступ изнутри контура, увидеть реальный метод получения транскрипта. До этого — в демо-скрипте закладывать fallback «файл расшифровки».
2. **Прогон связки MCP**: поднять mcp-atlassian в Docker (streamable-http) → подключить к Ouroboros (`Settings → Advanced`) → создать/прокомментировать задачу на тестовой Jira. Это ядро всех трёх фич — сделать первым.
3. **Цикл разработки скилла**: preflight → owner attestation («Skip review»), иначе каждая правка = дорогое три-модельное ревью. Отрепетировать.
4. **`scheduled_tasks` v1-семантика** («напоминание агенту», не детерминированный запуск) — проверить надёжность срабатывания «охраны» на практике; критично для фичи 2.
5. **Качество агентного цикла на GigaChat/Cloud.ru** — прогнать пайплайн готовности на внутренних моделях (наш ИБ-аргумент), сравнить с OpenRouter.
6. **Командный чат vs single-owner** — как telegram-bridge обрабатывает сообщения не-владельца в группе (нужно для «любой из команды тегает бота»).
7. Таймаут 300с/tool и лимит $300 — подтверждают решение синка 9.9 (детерминированные проверки кодом, семантика — LLM; зафиксировано в [architecture.md](architecture.md)).

## 5. Сводка по фичам

| Фича | Реализуемость | Из чего собирается |
|---|---|---|
| 1. Заводит задачи из чата/Jazz | ✅ (Jazz — через fallback) | telegram-bridge → агент + наш скилл (процесс в .md) → mcp-atlassian create issue |
| 2. Охраняет очередь Jira | ✅ | `scheduled_tasks` cron → JQL-поллинг → сверка с checklist.md → `mcp_jira__add_comment` |
| 3. Самоэволюция (diff к .md) | ✅ | cron раз в спринт → анализ задач через MCP → diff в чат → апрув владельца → правка файла скилла |
| Этап кода (ранняя версия) | ✅ | workspace-run + subagent worktree + patch-артефакты — штатно |
| Доска процесса (ui_tab) | ✅ | декларативный `kanban`-компонент — штатно |
| Стоимость задачи | ✅ | pricing.py usage events + budget tracking — штатно, тарифы GigaChat/Cloud.ru в рублях уже есть |
