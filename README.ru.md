# meta-sovereign (languages: [en](README.md) • [zh](README.zh.md) • [hi](README.hi.md) • ru)

`meta-sovereign` — персональная система **meta profile sovereign**: единый inbox, CRM и платформа автоматизации, которыми реально владеет пользователь. Система local-first, уважает приватность и собирает контакты, чаты, почту и паттерны из VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru и email-провайдеров.

## Попробовать сразу (без установки)

Откройте <https://link-foundation.github.io/meta-sovereign/> в современном браузере. Web-приложение запускается сразу, работает целиком в браузере и по умолчанию пишет в local storage. Данные не покидают устройство, пока вы сами не укажете сервер.

> Если ссылка еще не опубликована, workflow GitHub Pages (`.github/workflows/pages.yml`) опубликует ее при следующем push в `main`.

## Локальный сервер (рекомендуется для синхронизации)

Чтобы синхронизировать устройства, включить шифрование на диске и получить полный набор функций, запустите локальный сервер рядом со SPA. Доступны два backend; оба реализуют один wire protocol (см. [`docs/SERVER-PARITY.ru.md`](docs/SERVER-PARITY.ru.md)).

### Rust server — предпочтительный вариант (один бинарник, без runtime)

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

### JavaScript server — запасной вариант (Node/Bun/Deno)

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

Оба backend по умолчанию слушают <http://127.0.0.1:8787>. Hosted SPA автоматически находит локальный сервер через `discoverServer()` (сохраненный override → порты `127.0.0.1`). Если браузер не подключился сам, откройте **Settings → Server** в приложении и вставьте URL, который напечатал сервер.

## Подключение SPA к серверу

SPA выбирает сервер в таком порядке ([`js/src/web/discover.js`](js/src/web/discover.js)):

1. **Same origin** — когда SPA отдается прямо JS или Rust сервером.
2. **Сохраненный override** — `localStorage.metaServer`; его задает **Settings → Server**.
3. **Runtime shell candidates** — Electron и Capacitor передают URL встроенного сервера.
4. **Порты `127.0.0.1`** — default-порт локального сервера пробуется автоматически.
5. **LAN candidates от вызывающего кода** — передаются программно.

Если ничего не отвечает, SPA остается в **offline mode**: записи идут в локальное browser-хранилище ([`createBrowserStore`](js/src/storage/browser-store.js): IndexedDB → localStorage → in-memory) и автоматически replay-ятся через [`OfflineClient`](js/src/web/client.js), когда сервер появится.

Полный пользовательский сценарий — без установки, Rust server, JS server, desktop/mobile app, encrypted export и troubleshooting — описан в [`docs/USER-GUIDE.ru.md`](docs/USER-GUIDE.ru.md).

## Что умеет система

- **Единый inbox** для VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru и email.
- **Personal CRM**: контакты, сообщества, членства в группах, пересечения, массовый персонализированный outreach.
- **Personal memory**: структурированные факты `question → answer`, автоматически извлеченные из разговоров.
- **Платформа conversation automation**: редакторы паттернов, варианты ответов, n8n-style dialog graphs.
- **Переносимое хранилище**: бинарное [Doublets](https://github.com/linksplatform/doublets-rs) + текстовое [Links Notation](https://github.com/link-foundation/links-notation), автоматические backup, `.lino` import/export.
- **Local-first runtime**: WebRTC sync между устройствами пользователя, optional self-hosted personal cloud.
- **Два стека**: JS + Rust/WebAssembly по умолчанию и pure Rust server/microservice variant. On-disk format общий.

Полная карта requirement → status находится в [`docs/REQUIREMENTS.ru.md`](docs/REQUIREMENTS.ru.md); per-issue case studies — в [`docs/case-studies/`](docs/case-studies/).

## Статус

Прототип для issue #1 реализован и отслежен в PR #2:

- **Data layer (R-A\*)**: `DualStore` держит Doublets binary и Links Notation text в lock-step, поддерживает AES-256-GCM backups и encryption для `secret:*` links.
- **Service connectors (R-E\*)**: archive parsers и live API connectors для VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru и email.
- **Pattern matching and automation (R-C\*)**: `inferRegex`, `simplifyRegex`, `compilePeg`, fuzzy reply-variation extraction и `createGraph` / `runGraph`.
- **CRM (R-D\*)**: contact aggregation, audience DSL, mass-personal outreach, profile и resume sync envelopes.
- **Distribution (R-F\*)**: NPM library, CLI, local server, Electron shell, Capacitor mobile shell, Docker microservices для web + WebRTC.
- **Stacks (R-G\*)**: JS server + React SPA + Rust/WASM heavy workloads; alternative pure Rust server.
- **Hardening (R-K\*)**: soft-delete by default, AES-256-GCM master-key vault, несколько методов unlock, encrypted export.
- **Browser publishing (R-L\*)**: GitHub Pages CI workflow, публичный SPA URL, README и user guide для пользователя.

## Структура репозитория

`meta-sovereign` — многоязычный репозиторий:

- **JavaScript** находится в `js/`: `js/src/`, `js/tests/`, `js/scripts/`, `js/bin/`, `js/electron/`, `js/examples/`, `js/experiments/`.
- **Rust** находится в `rust/`: workspace manifest, lockfile и crates.
- **Native shells**: `js/electron/`, `mobile/`, `capacitor.config.json`, `docker/`.
- **Operations**: `.github/workflows/`, `.changeset/`, `docs/`.

```
.
├── .changeset/           # Changeset configuration
├── .github/workflows/    # GitHub Actions CI/CD
├── docker/               # Web + WebRTC Dockerfiles
├── docs/                 # Requirements, user guide, server parity, case studies
├── js/                   # JavaScript tree
├── mobile/               # Capacitor mobile shell
├── rust/                 # Rust workspace
└── package.json          # Node.js package manifest
```

---

## Справочник разработчика

Этот раздел предназначен для contributors.

### Быстрый старт

```bash
bun install
bun test
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests

RUN_BROWSER_E2E=1 npm run test:e2e:browser
cargo test --manifest-path rust/Cargo.toml --workspace
npm run build:web
npm run build:pages
bun run lint
bun run format:check
```

### CI/CD и quality gates

Pipeline включает fast checks, slow matrix tests, API docs build, broken-link checks и automated release. У каждого job есть явный `timeout-minutes`; отдельные tests защищены `node --test --test-timeout=30000` и `bun test --timeout 30000`.

Каждый PR должен проходить:

- ESLint и Prettier;
- `jscpd` duplication check;
- secrets scan;
- file line limits;
- test matrix Node, Bun, Deno × Ubuntu, macOS, Windows;
- documentation validation при изменении docs.

Подробности см. в [`docs/BEST-PRACTICES.ru.md`](docs/BEST-PRACTICES.ru.md).

### Скрипты

| Script                 | Назначение                            |
| ---------------------- | ------------------------------------- |
| `bun test`             | Запустить tests через Bun             |
| `bun run lint`         | Проверить code через ESLint           |
| `bun run lint:fix`     | Автоматически исправить lint issues   |
| `bun run format`       | Отформатировать код Prettier          |
| `bun run format:check` | Проверить formatting                  |
| `bun run check`        | Запустить lint + format + duplication |
| `bun run changeset`    | Создать changeset                     |
| `bun run build:web`    | Собрать production SPA bundle         |
| `bun run build:pages`  | Собрать artifact `dist/pages/`        |
| `bun run build:mobile` | Собрать Capacitor mobile bundle       |

### Участие

Подробные правила находятся в [`docs/CONTRIBUTING.ru.md`](docs/CONTRIBUTING.ru.md). Обычный flow: fork, branch, изменения, changeset, commit, push и Pull Request.

## Лицензия

[Unlicense](LICENSE) - public domain.
