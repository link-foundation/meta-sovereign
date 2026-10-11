# Руководство пользователя (languages: [en](USER-GUIDE.md) • [zh](USER-GUIDE.zh.md) • [hi](USER-GUIDE.hi.md) • ru)

Эта страница собирает пользовательские сценарии `meta-sovereign` в одном месте. Они упорядочены от “ничего не устанавливать” до “установить все”, чтобы можно было остановиться сразу после нужного варианта.

> **TL;DR:** откройте <https://link-foundation.github.io/meta-sovereign/>. Это все web-приложение. При необходимости запустите локальный Rust server или JS server, чтобы синхронизировать данные между устройствами.

## 1. Ничего не устанавливать — открыть web app

1. Откройте <https://link-foundation.github.io/meta-sovereign/> в Chrome, Firefox, Safari или Edge.
2. App запускается сразу. Нет sign-up, нет telemetry, и данные не выходят из браузера, пока вы не укажете server.
3. Данные хранятся в browser-local storage ([`createBrowserStore`](../js/src/storage/browser-store.js): IndexedDB → localStorage → memory). Уже можно:
   - просматривать и искать импортированные contacts;
   - создавать chat patterns и reply variations;
   - собирать broadcasts и outreach plans;
   - triage чатов через operator UI.

Если вы используете один device, этого достаточно.

## 2. Добавить локальный Rust server (preferred)

Rust server — один binary без runtime и с самым быстрым cold start. Он exposes тот же wire protocol, что и JS server (см. [`docs/SERVER-PARITY.ru.md`](./SERVER-PARITY.ru.md)).

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

Server слушает <http://127.0.0.1:8787> по умолчанию. SPA на GitHub Pages найдет его автоматически через saved override (`metaServer` в `localStorage`) и список портов `127.0.0.1`.

Если browser не подключился, откройте **Settings → Server** и вставьте URL, который напечатал Rust binary.

## 3. Добавить локальный JS server (fallback)

Используйте этот вариант, если нет Rust toolchain или нужны routes, которые Rust server еще не догнал: `/api/backups`, `/api/export-encrypted`, `/api/links/purge-tombstones`, `/api/outreach`.

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

Или через Bun:

```bash
bunx meta-sovereign serve
```

JS server слушает тот же port и говорит тем же wire protocol; SPA не важно, какой backend на другой стороне.

## 4. Установить desktop или mobile app

Desktop и mobile apps заворачивают тот же SPA с GitHub Pages и встроенный server в native shell. Используйте их, если нужен offline-only mode без вкладки браузера.

| Platform | Build command                                       |
| -------- | --------------------------------------------------- |
| Electron | `npm run electron`                                  |
| iOS      | `npm run mobile:ios` (открывает Xcode)              |
| Android  | `npm run mobile:android` (открывает Android Studio) |

Electron и Capacitor shell переиспользуют `js/src/web/` без изменений. Desktop shell также включает `electron-updater`, если optional peer dependency установлена.

## 5. Подключить SPA к server

[`discoverServer()`](../js/src/web/discover.js) выбирает server так:

1. **Same origin** — когда SPA отдается прямо JS или Rust server.
2. **Saved override** — `localStorage.metaServer = "https://my-server"`, задается через **Settings → Server**.
3. **Runtime shell candidates** — Electron и Capacitor inject URL встроенного server.
4. **Порты `127.0.0.1`** — default server port probe-ится автоматически.
5. **Caller-supplied LAN candidates** — список передается программно.

Если ничего не отвечает, SPA остается в **offline mode** и пишет в local browser store. Когда server появляется позже, [`OfflineClient`](../js/src/web/client.js) replay-ит queued writes.

## 6. Sync между устройствами (WebRTC)

Когда устройства используют один server (Rust или JS), они sync-ятся через WebRTC и server endpoint `/rtc` ([`webrtc-sync.js`](../js/src/web/webrtc-sync.js)). Трафик peer-to-peer; server нужен только для initial handshake. Для symmetric NAT см. [`docs/WEBRTC-TURN.ru.md`](./WEBRTC-TURN.ru.md).

## 7. Encrypted backup and export

Данные encrypted-at-rest by default ([`vault.js`](../js/src/storage/vault.js), AES-256-GCM, master key + passphrase/PIN/passkey/TOTP unlocks).

Экспорт encrypted snapshot из CLI:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

Также доступен `POST /api/export-encrypted` из SPA, подключенного к JS server. Rust server пока не exposes этот route; в этом случае используйте CLI.

## 8. Import данных

Положите archive files в `~/.meta-sovereign/imports/` (configurable) и выполните:

```bash
meta-sovereign import
```

Supported sources: email (`.eml`/mbox), VK, Telegram Desktop, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru. Полный список — в [`docs/REQUIREMENTS.ru.md`](./REQUIREMENTS.ru.md), section E.

Для live email используйте `source-pull --source=email --protocol=gmail`, `microsoft-graph`, `jmap`, `imap` или `pop3`. Raw IMAP/POP3/SMTP требуют `--host`, `--username`, `--password`, если не заданы эквивалентные `EMAIL_*` env vars.

## 9. Sync CV между job platforms

CV обычно живет одновременно на LinkedIn, hh.ru, Habr Career, Naukri,
VietnamWorks, TopCV и SuperJob, и эти семь копий расходятся.
`meta-sovereign` читает их все через браузер на вашей машине, показывает
различия и записывает согласованные значения обратно.

Для этого нужен CLI: web page не может управлять другой web page,
поэтому экран **CV** в приложении показывает покрытие, различия и историю
запусков, а сами запуски отдает терминалу.

```bash
# один раз: поставить browser engine (optional dependency)
npm install playwright browser-commander
npx playwright install chromium

# что поддерживается и насколько markup уже проверен
meta-sovereign cv-platforms

# войти один раз в видимом браузере; session сохранится в profile
meta-sovereign cv-read --platforms=linkedin --headed --profile=~/.meta-sovereign/cv

# прочитать несколько профилей, сохраняя snapshots страниц
meta-sovereign cv-read --platforms=linkedin,hh,naukri --login=<ваш-логин> --artifacts=./cv-runs

# сравнить прочитанное — браузер не нужен
meta-sovereign cv-diff --prefer=linkedin

# посмотреть, что изменит sync, и выполнить его
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# записать одно поле или одну секцию редактора и ничего больше
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# что происходило в последних запусках
meta-sovereign cv-telemetry --type=step.miss
```

Пароль платформы никто не спрашивает: браузер открывается с `--headed`,
вы входите как обычно, а session остается в указанном profile directory.

Те же операции доступны по HTTP, когда запущен локальный server:
`GET /api/cv/platforms`, `GET /api/cv/plan?platform=…`,
`GET /api/cv/stored`, `POST /api/cv/read`, `POST /api/cv/compare`,
`POST /api/cv/sync`, `GET /api/cv/telemetry`.

| Симптом                               | Что это значит                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `browser-commander is not installed`  | Поставьте optional dependencies выше или используйте `cv-platforms` / `cv-plan` / `cv-diff` — они браузер не открывают. |
| Запуск остановился с `login-required` | Платформа перебросила на страницу входа. Повторите с `--headed` и войдите.                                              |
| Запуск остановился с `step-missed`    | Сайт изменил markup. В причине указан selector; `cv-telemetry` и HTML из `--artifacts` показывают страницу.             |
| Платформа сообщает `unsupported`      | Для этого поля у платформы нет редактора — изменение не теряется молча, а попадает в отчет.                             |
| Поле помечено `deselected`            | Оно записываемое, но ваш фильтр `--paths`/`--groups` его не выбрал.                                                     |
| Экран CV говорит, что нужен JS server | Подключенный backend (например, Rust server) не отдает маршруты `/api/cv/*`.                                            |

Подробности — канонический формат CV, словарь шагов, события telemetry и
что именно проверено на каждой платформе — в
[`docs/CV-SYNC.ru.md`](./CV-SYNC.ru.md).

## 10. Автоматизации: писать людям по правилам, безопасно

Автоматизация задаёт, кому писать, когда, при каких условиях и каким
текстом. Откройте вкладку **Автоматизация**, чтобы редактировать,
просматривать и запускать их. Первая из них — пресет из issue #31
"Say hi to contacts silent for 90 days" (поздороваться с теми, кто
молчит 90 дней): каждый личный 1:1 чат без сообщений не меньше 90
дней — группы, каналы и боты не попадают — получает одно сообщение:

- "Привет … Тебе или твоим друзьям …", если вы с этим человеком были на
  "ты", и "Здравствуйте … Вам или вашим друзьям …", если на "вы". Форма
  определяется по диалогу правилами на уровне слов; если данных нет или
  их поровну, используется вежливое "вы". Оба текста можно изменить, в
  них доступны `{name}`, `{days}` и `{network}`.
- Другие пресеты спрашивают об открытых вакансиях, предлагают работу по
  контракту или отвечают на приветствие тому, кто поздоровался.
  **Новая автоматизация** создаёт пустую.

У каждой автоматизации есть:

- **Когда запускается**: вручную, из меню чата, по расписанию
  (`30m`, `12h`, `1d`, `2w`) и/или на входящее сообщение, совпадающее с
  регулярным выражением.
- **Кому**: аудитория — `personal`, `friends:vk`, `chat:vk:<id>`,
  `community:vk:<id>`, `list:<id>`, `audience:<id>` или `person:vk:<id>`,
  соединённые через `|` (или), `&` (и), `-` (кроме) и скобки, например
  `friends:vk & chat:vk:2000000001 - list:blocked`.
- **Условия**: молчание не меньше N дней, не повторять N дней, только
  чаты, где вы тоже писали, только личные чаты, кто написал последним,
  какие сети.
- **Режим**: **безопасный** (по умолчанию) оставляет черновик в каждом
  чате; **автоматический** отправляет с индикатором набора, случайными
  паузами и дневным лимитом, один раз спросив вас.

**Предпросмотр** показывает, кто какой текст получит и почему остальные
не вошли ("недавно общались", "черновик уже ждёт", …); ничего не
отправляется. В безопасном режиме каждый черновик появляется в своём
чате: отредактируйте его, нажмите **Отправить** (сам клик и есть
подтверждение), переключите ты/вы, **Открыть чат** в сети, **Я
отправил(а) сам(а)** или **Пропустить**. Каждый исход запоминается, так
что тому же человеку случайно не напишут дважды.

**Люди** — поиск по всем сетям (тот же человек в других сетях показан
перекрёстными ссылками); выберите людей, чтобы запустить автоматизацию
только для них, или сохраните их списком. **Аудитории** сохраняют
именованные спецификации и считают, кто под них подходит. Чтобы
проверить автоматизацию на одном человеке, откройте его чат и выберите
**⚡ Автоматизации → Проверить в этом чате**.

Сам чат (вкладка **Чат**) подсказывает ответы, пока вы печатаете:
сначала целые ответы, которые вы раньше давали на последнее сообщение
чата, начиная с самых частых, затем слово за словом из ваших
собственных сообщений; **Tab** берёт первую подсказку. Чат показывает,
когда печатает собеседник — или автоматизация от вашего имени. Отправка
идёт через API сети, а если не получается — через её официальный web
UI. **Настройки → Внешний вид** выбирает тему (как в системе, светлая,
тёмная или авто по времени суток) и оформление (t3.codes, Telegram,
WhatsApp или Signal).

```bash
# сохранённые автоматизации и пресеты
meta-sovereign automations
# кто что получит и почему остальные не вошли — ничего не записывается
meta-sovereign automations plan reengage-dormant
# безопасный режим: поставить в очередь по одному черновику на человека
meta-sovereign automations run reengage-dormant
# по одному черновику за раз — [y] отправить, [m] отправил(а) сам(а), [e] изменить, [f] переключить ты/вы, [s] пропустить, [q] выйти
meta-sovereign automations review
# автоматический режим отправляет только с --confirm=true; --chat сужает запуск до выбранных чатов
meta-sovereign automations run job-search --chat=vk:101 --confirm=true
```

По HTTP: `/api/automations` (список, `PUT` для сохранения),
`/api/automations/plan`, `/run`, `/drafts`,
`/drafts/{send,form,mark,skip}` и `/history`; `/api/people`,
`/api/audiences`, `/api/lists`, `/api/send`, `/api/typing` и
`/api/suggest`. Подробности:
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md).

## 11. Troubleshooting

| Symptom                               | Fix                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SPA завис на loading spinner.         | Dev tools → Application → IndexedDB: проверьте database `meta-sovereign`; возможно, storage disabled. |
| SPA не видит local server.            | В app откройте **Settings → Server** и вставьте точный URL.                                           |
| Server сообщает `EADDRINUSE`.         | Передайте `--port=NNNN` в `meta-sovereign serve` или Rust `serve --port=NNNN`.                        |
| WebRTC sync ломается между двумя LAN. | Настройте TURN server: [`docs/WEBRTC-TURN.ru.md`](./WEBRTC-TURN.ru.md).                               |
| `cargo build` падает с linker error.  | Установите C toolchain (`build-essential` на Debian/Ubuntu, Xcode CLI tools на macOS).                |

## 12. Дальше

- [`README.ru.md`](../README.ru.md) — overview проекта и developer notes.
- [`docs/REQUIREMENTS.ru.md`](./REQUIREMENTS.ru.md) — canonical requirements.
- [`docs/SERVER-PARITY.ru.md`](./SERVER-PARITY.ru.md) — JS vs. Rust routes.
- [`docs/CV-SYNC.ru.md`](./CV-SYNC.ru.md) — как устроена синхронизация CV, платформа за платформой.
- [`docs/UI-DESIGN-AUDIT.ru.md`](./UI-DESIGN-AUDIT.ru.md) — accessibility и design audit.
- [`docs/case-studies/`](./case-studies/) — case studies по каждому issue.
