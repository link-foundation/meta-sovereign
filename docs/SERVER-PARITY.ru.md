# Server parity matrix — JS server vs. Rust server (languages: [en](SERVER-PARITY.md) • [zh](SERVER-PARITY.zh.md) • [hi](SERVER-PARITY.hi.md) • ru)

Эта страница перечисляет HTTP routes и transport surfaces, которые
предоставляют JavaScript server (`js/src/server/index.js` + `routes-*.js`)
и pure-Rust server (`rust/crates/meta-sovereign-server/src/routes.rs` +
`handlers.rs`), чтобы users могли выбрать backend с пониманием feature
parity.

Rust server - preferred local backend: single binary, no runtime,
fastest cold start. JS server - fallback: сегодня в нем больше features,
и он работает там, где доступны Bun/Node/Deno.

| Status    | Meaning                                      |
| --------- | -------------------------------------------- |
| Parity    | Оба servers имеют тот же route и wire shape. |
| JS only   | Есть в JS server, еще не перенесено в Rust.  |
| Rust only | Есть в Rust server, отсутствует в JS.        |

## 1. Links routes

GET/PUT/DELETE для `/links` и `/links/:id` имеют parity на обоих
servers. `?include=tombstones`, `?showDeleted=1`,
`?purge=1&confirm=1` работают одинаково.

## 2. Derived read routes

`/api/contacts`, `/api/status`, `/api/autocomplete`, `/api/audience`,
`/api/facts`, `/api/search`, `/api/health`, `/sources` и `/metrics`
имеют parity на обоих servers.

## 3. Mutating CRUD routes

patterns, graphs, replies, profile, resume, broadcast, а также
`/api/email/pull` и `/api/email/send` сохраняют wire parity. Rust email
routes принимают тот же archive ingest envelope, что и JS. Live Gmail,
Microsoft Graph, JMAP и raw IMAP/POP3/SMTP остаются JS server features,
потому что Rust crate остается `std`-only.

## 4. Outreach, backups, hardening

`/api/outreach`, `/api/backups`, `/api/backups/restore`,
`/api/export-encrypted` и `/api/links/purge-tombstones` пока JS only.
Если Rust server возвращает `404`, SPA скрывает или откатывает
соответствующие features; CLI продолжает использовать локальную JS
implementation.

## 5. Синхронизация CV

`/api/cv/platforms`, `/api/cv/plan`, `/api/cv/stored`, `/api/cv/read`,
`/api/cv/compare`, `/api/cv/sync` и `/api/cv/telemetry` (R-V16) - JS
only, и по структурной причине: `read` и `sync` управляют настоящим
браузером через `browser-commander` + Playwright, а Rust crate
использует только `std` и не может запустить такой процесс. Остальные
четыре маршрута браузера не трогают и портируемы; до этого SPA
показывает на CV screen явное сообщение "нужен JS server" вместо пустой
таблицы. Подробности: [`docs/CV-SYNC.ru.md`](./CV-SYNC.ru.md).

## 5a. Автоматизации, люди, отправка и подсказки

| Route                                           | Method           | JS server                             | Rust server | Status      |
| ----------------------------------------------- | ---------------- | ------------------------------------- | ----------- | ----------- |
| `/api/automations`                              | GET, PUT         | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/<id>`                         | DELETE           | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/presets`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/plan`                         | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/run`                          | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts`                       | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts/{send,form,mark,skip}` | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/history`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/send`                                     | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/typing`                                   | GET, POST        | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/people`, `/api/people/xref`               | GET              | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences`, `/api/lists`                  | GET, PUT, DELETE | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences/resolve`                        | POST             | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/suggest`, `/api/suggest/stats`            | GET              | `js/src/server/routes-suggest.js`     | _missing_   | **JS only** |

Эти маршруты (issue #31 и PR #34, R-X6..R-X18) - тонкие обёртки над
`js/src/automation/`, `js/src/crm/people.js` и `js/src/replies/`. SPA
сначала спрашивает сервер, потому что на нём лежат все импортированные
архивы и учётные данные адаптеров, а без сервера запускает тот же код
над ссылками, которые уже есть в браузере
(`js/src/web/automation-api.js`): offline она по-прежнему показывает
список автоматизаций, редактирует их и строит предпросмотр, держит
черновики безопасного режима в их чатах, ищет людей, вычисляет
аудитории и подсказывает ответы. Сервер нужен только для доставки
сообщения; сообщение, набранное в поле ввода чата без сервера,
хранится в браузере, пока сервер его не синхронизирует. Команда CLI
`automations` работает вообще без сервера.

## 6. Real-time transports и static assets

`/ws` WebSocket sync и `/rtc` WebRTC signalling имеют parity. `/`,
`/index.html`, flat assets, `/storage/`, `/handlers/` и `/sync/` mounts
также обслуживаются одинаково и отвергают path traversal.

## 7. Summary

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read + derived + meta          | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| Синхронизация CV               | 7      | 0      | 7       |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **47** | **34** | **13**  |

Rust server сегодня достиг **72% route parity**. Для типичного user flow

- открыть SPA, просмотреть contacts, отправить messages, automate
  replies, sync между devices, ingest email archives - Rust server является
  drop-in replacement для JS server.
