# meta-sovereign (languages: [en](README.md) • [zh](README.zh.md) • [hi](README.hi.md) • ru)

**Один inbox, одна книга контактов и одни автоматизации для всех сетей, через которые вы общаетесь, — на вашем собственном компьютере.**

meta-sovereign представляет **человека или организацию в интернете**. Подключите Telegram, VK, WhatsApp, Facebook и Instagram, X, LinkedIn, почту, GitHub, Upwork, PeoplePerHour и сайты вакансий (career.habr.com, hh.ru, superjob.ru и другие) и ведите все разговоры в одном приложении. Local-first и open source: сообщения, контакты и ключи остаются в вашем хранилище, с зашифрованными резервными копиями и без облака посередине.

### Для кого

| Кто / что       | Чем помогает meta-sovereign                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Люди**        | Все чаты в одном месте, возобновить общение с теми, кто давно молчит, помнить, что было сказано (факты), одно резюме на всех сайтах вакансий.                            |
| **Продажи**     | Лиды из всех сетей в одной CRM, аудитории по правилам, массово-персональные рассылки, где каждое сообщение уходит один раз и вежливо, follow-up, быстрые ответы.         |
| **Маркетинг**   | Рассылки по аудиториям, посты в каналы Telegram, LinkedIn и X, актуальные участники сообществ, список отписавшихся, который соблюдает каждая автоматическая отправка.    |
| **Поддержка**   | Одна очередь оператора для всех входящих, ответы от имени сообщества VK или аккаунта Telegram Business, автоответы как безопасные черновики, база знаний из фактов.      |
| **Организации** | Те же инструменты для бренда, магазина или проекта: его аккаунты, его контакты, его данные на его компьютере. Командный режим (несколько операторов) — в дорожной карте. |

Что уже работает для каждого сценария, что частично и что дальше — в дорожной карте: [`docs/ROADMAP.ru.md`](docs/ROADMAP.ru.md).

## Попробовать сразу (без установки)

Откройте <https://link-foundation.github.io/meta-sovereign/> в современном браузере. Web-приложение запускается сразу, работает целиком в браузере и по умолчанию пишет в local storage. Данные не покидают устройство, пока вы сами не укажете сервер.

> Если ссылка еще не опубликована, workflow GitHub Pages (`.github/workflows/pages.yml`) опубликует ее при следующем push в `main`.

Без сервера hosted app работает в **browser-only mode**: контакты, паттерны и рассылки работают из browser store, а импорт, автоматизации, синхронизация, CV sync и приветствия ждут локальный сервер. Уведомление показывает команду для запуска сервера и кнопку **Check again**.

## Desktop app

Скачайте installer для своей системы на <https://link-foundation.github.io/meta-sovereign/download/> или в [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases): Linux (AppImage, deb, tar.gz), macOS (dmg, zip) и Windows (installer, portable), каждый для x64 и arm64. Desktop app включает сервер, поэтому все функции работают без отдельного запуска сервера. Первый запуск неподписанных сборок, контрольные суммы и обновления описаны в [`docs/USER-GUIDE.ru.md` §4](docs/USER-GUIDE.ru.md#4-установить-desktop-или-mobile-app).

## Локальный сервер (рекомендуется для синхронизации)

Чтобы синхронизировать устройства и получить полный набор функций, запустите локальный сервер рядом со SPA. Доступны два backend; оба реализуют один wire protocol (см. [`docs/SERVER-PARITY.ru.md`](docs/SERVER-PARITY.ru.md)).

### Rust server — один бинарник, без runtime, но с ограничениями

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **Ограничения Rust server.** Он хранит links **только в памяти**: на диск ничего не пишется, поэтому после остановки server все данные пропадают. У него **нет source adapters**: нет live-загрузки из Telegram, VK, GitHub, Upwork и т. п., нет исходящего HTTP/TLS client (email только принимает архивы), нет automations, CV sync, browser auto-import, backups и `/api/export-encrypted`. Для реальной работы выбирайте JS server или desktop app. Список routes по одному — в [`docs/SERVER-PARITY.ru.md`](docs/SERVER-PARITY.ru.md).

### JavaScript server — полный набор функций (Node/Bun/Deno), из исходников

Пакета **пока нет в npm** (registry отвечает 404), поэтому `npx -y meta-sovereign serve` сегодня не работает. Запустите server из клона репозитория (нужны Node.js и npm):

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

Когда пакет будет опубликован в npm, заработают `npx -y meta-sovereign serve` (или `npm install -g meta-sovereign && meta-sovereign serve`). До тех пор запустить server без toolchain можно через desktop app (выше).

Оба backend по умолчанию слушают <http://127.0.0.1:8787>. JS server отвечает origin hosted app (`https://link-foundation.github.io`) с CORS headers; другие origins разрешаются через `meta-sovereign serve --allow-origin=<origins>` или `MS_ALLOW_ORIGINS`. Safari не пускает `https` страницы на `http://127.0.0.1`, но пускает на `https://127.0.0.1`; сервер теперь отвечает по HTTPS на том же порту с собственным сертификатом для localhost. Выполните `node js/bin/meta-sovereign.js trust` один раз (macOS добавляет сертификат в login keychain; на других системах печатается путь к сертификату) или откройте `https://127.0.0.1:8787/trust` в Safari и следуйте подсказкам — после этого hosted app в Safari подключается к серверу напрямую. До того уведомление называет сервер и предлагает **Доверять серверу** (<https://127.0.0.1:8787/trust>); ссылка на localhost-копию появляется только при её явном включении. `--tls=false` / `MS_TLS=off` отключает HTTPS. Safari использует размещённое приложение через доверенный локальный HTTPS API; localhost-интерфейс необязателен. Hosted SPA автоматически находит локальный сервер через `discoverServer()` (сохраненный override → порты `127.0.0.1`). Если браузер не подключился сам, откройте **Settings → Server** в приложении и вставьте URL, который напечатал сервер.

По умолчанию интерфейс — размещённое приложение: `serve` печатает его адрес, <https://link-foundation.github.io/meta-sovereign/>, а приложение само находит сервер на нашем порту 8787 (а также смотрит 8788, 7001, 7002 и 3000; на другом порту `serve` подскажет указать его в **Settings → Server**), так что серверу не нужно держать сайт. По умолчанию `/` перенаправляет на GitHub Pages, а сервер предоставляет API, синхронизацию и вспомогательные маршруты подключения. Копия на localhost для работы без интернета включается отдельно: `serve --local-ui=true` (или `MS_LOCAL_UI=on`), после чего она доступна на <http://127.0.0.1:8787>. Desktop-оболочка явно включает свой встроенный интерфейс. `--ui-url=<url>` (или `MS_UI_URL`) задаёт другую размещённую копию, например Pages форка, и разрешает её origin.

В macOS интерактивный `serve` выполняет настройку целиком: защищает TLS-ключ этой установки через Secure Enclave, проверяет доверие сертификату, запрашивает его только при необходимости и открывает приложение на GitHub Pages. Без интерактивного терминала: `node js/bin/meta-sovereign.js serve --trust=true --open=true`. `--trust=false` и `--open=false` отключают эти действия. Для Swift-помощника нужны macOS Command Line Tools; `--hardware-key=false` явно выбирает файловый ключ на неподдерживаемом Mac. Аппаратная защита действует на диске; Node использует ключ в памяти. Правила и ограничения: [настройка и безопасность локального сервера](docs/LOCAL-SERVER-SECURITY.md).

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

- **Единый inbox** для VK, Telegram, X, WhatsApp, Facebook, Instagram, LinkedIn, почты, GitHub, Upwork, PeoplePerHour и сайтов вакансий: живые обновления там, где сеть это позволяет (Telegram, VK Long Poll, инкрементальный IMAP, GitHub), и импорт архивов любого размера для остальных.
- **Чат, который ведёт себя как приложения Telegram**: каждое сообщение отправляется один раз, галочки доставки, живые обновления и догрузка после разрыва, отметки о прочтении, облачные черновики, повторы, переживающие перезагрузку ([`docs/CHAT-REFERENCES.ru.md`](docs/CHAT-REFERENCES.ru.md)).
- **CRM**: всё о контакте в одном окне, один и тот же человек в разных сетях, сообщества и членства, поиск, аудитории по правилам (`friends:vk & chat:vk:… - list:blocked`).
- **Рассылки, broadcast и автоматизации**: кому писать, когда, при каких условиях и каким текстом; предпросмотр, кто что получит; по умолчанию безопасные черновики или отправка с паузами, тихими часами, перерывом для каждого чата, дневными лимитами и списком отписавшихся. Каждая автоматическая отправка идёт через один outbox: не больше одного раза, а неясный результат сам не повторяется ([`docs/USER-GUIDE.ru.md`](docs/USER-GUIDE.ru.md), §11).
- **Очередь оператора и ответы**: непрочитанные сообщения чат за чатом, подсказки ответов из ваших прошлых ответов (Tab берёт подсказку), паттерны и варианты ответов, автоответы на подходящее сообщение.
- **Аккаунты бизнеса и сообществ**: токен сообщества VK запускает Bots Long Poll; Telegram Business: быстрые ответы, приветствие и сообщение об отсутствии, часы работы, чат-боты.
- **Память**: структурированные факты `вопрос → ответ` из разговоров, с проверкой прямо в чате.
- **Приветствия**: начинать диалоги в VK, Telegram, WhatsApp, Messenger, X и почте с «привет» или стикера, как [konard/vk-bot](https://github.com/konard/vk-bot) ([`docs/GREETINGS.ru.md`](docs/GREETINGS.ru.md)).
- **Синхронизация резюме** между LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV и SuperJob через ваш собственный браузер, поле за полем ([`docs/CV-SYNC.ru.md`](docs/CV-SYNC.ru.md)).
- **Ваши данные в безопасности**: локальное хранилище, переживающее сбои ([Doublets](https://github.com/linksplatform/doublets-rs) + [Links Notation](https://github.com/link-foundation/links-notation)), автоматические миграции схемы ([`docs/DATA-MIGRATIONS.ru.md`](docs/DATA-MIGRATIONS.ru.md)), потоковые зашифрованные резервные копии, работа при полном диске, зашифрованные секреты, локальный сервер, который не пускает чужие сайты.
- **Везде, где вы**: веб-приложение, настольное приложение со встроенным сервером, мобильные оболочки, WebRTC-синхронизация между вашими устройствами, офлайн-записи, которые доотправляются позже; вариант сервера на чистом Rust использует тот же формат на диске.
- **Четыре языка**: приложение и все документы — на английском, русском, хинди и китайском.

Каждая функция по каждой сети — поддерживается, частично или нет, и доступна ли через API или веб-приложение: [`docs/FEATURES.ru.md`](docs/FEATURES.ru.md). Каждое требование с подтверждением: [`docs/REQUIREMENTS.ru.md`](docs/REQUIREMENTS.ru.md).

## Статус

Требования R-A–R-Z24 выполнены и проверяются в CI на Node, Bun и Deno в Linux, macOS и Windows, с браузерными end-to-end тестами в Chromium. Тесты используют подделки: ничего не отправляется с реального аккаунта, и только отображение сообщений Telegram дополнительно проверено на реальном хранилище. Состояние по сценариям и следующие шаги (проверка на живых аккаунтах, вход по OAuth, командный режим, воронка продаж, результаты кампаний) — в [`docs/ROADMAP.ru.md`](docs/ROADMAP.ru.md).

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
