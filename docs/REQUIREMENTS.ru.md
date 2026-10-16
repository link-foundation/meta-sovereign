# Requirements (languages: [en](REQUIREMENTS.md) • [zh](REQUIREMENTS.zh.md) • [hi](REQUIREMENTS.hi.md) • ru)

Это русская версия top-level requirements ledger для `meta-sovereign`.
Stable `R-*` IDs, code symbols, routes, commands и file paths оставлены
в исходном виде, чтобы их можно было сверять с английским
[`REQUIREMENTS.md`](./REQUIREMENTS.md), changesets, PRs и code comments.

Detailed breakdown по каждому issue находится в
[`docs/case-studies/`](./case-studies/). [`docs/ROADMAP.md`](./ROADMAP.md)
остается reviewer-facing roadmap ledger.

## A. Data layer

R-A1..R-A5 покрывают unified database import/export, `.lino` files,
binary Doublets + text store sync, automatic encrypted backups и
indented Links Notation. State: done через `DualStore`, `LinoTextStore`,
backup scheduler и secret-link encryption.

## B. Unified communication UI

R-B1..R-B4 требуют unified chat UI, autocomplete на основе previous
outgoing messages, operator DONE/NEXT workflow и cross-service broadcast
UI. State: done in SPA views and `/api/*` routes.

## C. Pattern matching and reply automation

R-C1..R-C5 покрывают regex/PEG pattern editor, reply variation editor,
n8n-style graph automation, auto/semi-auto modes и multi-message fact
extraction. State: done in patterns, facts, graph and reply surfaces.

## D. Personal CRM

R-D1..R-D6 покрывают contact detail aggregation, audience DSL,
mass-personal outreach, configurable search, profile sync и resume sync.
State: done.

## E. External-service connectors

R-E1..R-E10 требуют archive/live support для VK, Telegram, X, WhatsApp,
Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru и email. State:
done; adapters normalize data into unified links. R-E11..R-E13
добавляют Naukri, VietnamWorks и TopCV: у них нет публичного API, поэтому
данные приходят из экспортов и из browser session (см. секцию V).

## F. Distribution, sync, deployment

R-F1..R-F8 покрывают NPM library surface, CLI, Electron, local web
server, WebRTC sync, Docker microservices и server/client Universal
Links API. State: done.

## G. Stack constraints

R-G1..R-G3 покрывают JS server/client + React UI + Rust/WASM heavy
workloads, pure-Rust alternative server и iOS/Android/Electron packaging.
State: done.

## H. Quality, design, process

R-H1..R-H6 покрывают Apple/Material/Fluent UI guidance, simple code,
automated API docs, unit/integration/e2e coverage, CI/CD parity и
Unlicense. State: done.

## I. Documentation deliverable (issue #1)

R-I1..R-I5 требуют case study, online research, requirements, solution
plan и components survey для issue #1. State: done.

## J. Maintainer directives from PR #2

R-J1..R-J11 покрывают offline browser storage, server autodiscovery,
WebRTC/WebSocket, handler-driven store API, handled stamps,
decentralized GitHub Pages deployment, browser-commander e2e, pure-Rust
server, requirements/roadmap ledger, single-PR completion и CI timeout
policy. State: done.

## K. Hardening (issue #6)

R-K1..R-K20 покрывают soft delete, recoverable tombstones, explicit
purge, sync semantics, provider delete behavior, vault master key,
multiple unlock methods, encrypted exports, HTTP/CLI purge/export и
case study для issue #6. State: done.

## L. Browser-first publishing (issue #8)

R-L1..R-L15 покрывают GitHub Pages SPA publishing, browser-first docs,
Pages workflow, server discovery, Rust/JS backend guidance, case study и
CI/CD alignment. State: done.

## M. Newbie-friendly UI (issue #10)

R-M1..R-M18 покрывают connection guides, CORS-aware probes, theme toggle,
tutorial overlay, settings guidance, e2e coverage и case study для issue
#10. State: done.

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 покрывают tutorial refresh persistence, Next/Skip/Complete
persistence, reopen reset, case study, external research и root-cause
note. State: done.

## O. Email support (issue #3)

R-N1..R-N10 (historical numbering retained) покрывают email research,
archive import, Gmail/Microsoft Graph/JMAP live receive/send,
IMAP/POP3/SMTP local-server fallback, HTTP routes, CLI/API surface и
reproducing tests. State: done.

## P. Provider connections (issue #16)

R-O1..R-O19 покрывают provider credential forms, archive upload/paste
import, settings surface, Connect first CTA, secret storage, probe
classification, CORS help, tests и issue #16 case study. State: PR #17
still in progress.

## Q. UI and documentation internationalisation (issue #18)

R-Q1..R-Q10 покрывают SPA language switcher, browser language detection,
local override persistence, `<html lang>`/`dir`, translation keys для
authored UI strings, dictionary parity tests, Markdown language
switchers, translated docs siblings, docs-language automation, issue #18
case study и single-PR delivery in PR #19. State: PR #19 in progress.

## U. Mobile-first UI overhaul (issue #25)

R-N1..R-N12 покрывают mobile-first AppShell (bottom-nav / side-rail /
permanent drawer), Apple-glass tokens с `prefers-reduced-transparency`
fallback, full translation coverage (no English literal в non-EN
builds), separate Connections page с одним card per provider и
`connected/not-connected/action-required` state badge, dedicated detail
screen и `setupSteps[]` per provider, element-anchored tutorial
spotlight и "Connect a service" opening step. State: PR #26 in progress
on branch `issue-25-dac43a780b5c`. Detailed table:
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U.

## V. Синхронизация CV между job platforms (issue #29)

R-V1..R-V22 покрывают канонический CV model в links notation,
cross-platform diff и reconcile, declarative browser plans для семи
платформ (LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV,
SuperJob), registry validation с подсчетом verified/documented/draft
steps, telemetry с redaction и HTML/screenshot artifacts, plan runner
поверх browser-commander, facade / HTTP routes / CLI commands / SPA
screen, чистоту web bundle, выборочную запись по `--paths` и
`--groups`, прогон каждого плана через настоящий браузер на fixture
markup и честную деградацию, когда backend не отдает `/api/cv/*`.
State: done в PR #30. Подробная таблица:
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section V; описание работы —
[`docs/CV-SYNC.ru.md`](./CV-SYNC.ru.md).

## W. Источники токенов VK после блокировки Kate Mobile (issue #32)

R-W1..R-W5 покрывают проверку всех клиентов vkhost.github.io на текущем
OAuth-шлюзе VK, каталог `VK_TOKEN_SOURCES` с ранжированием, при котором
клиенты самой VK идут раньше небольших сторонних издателей,
`inspectVkToken()` для проверки уже имеющегося токена только
документированными методами, исправленную подсказку VK во всех четырёх
локалях и переход коннектора на домен `api.vk.ru`. State: PR #33.
Подробная таблица: [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section W;
исследование — [`docs/case-studies/issue-32/`](./case-studies/issue-32/README.md).

## X. Автоматизации, аудитории и чат (issue #31, PR #34)

Эти требования вытекают из
[issue #31](https://github.com/link-foundation/meta-sovereign/issues/31) —
"support messaging to all personal contacts we were not talking for
long" — и из
[review PR #34](https://github.com/link-foundation/meta-sovereign/pull/34),
в котором попросили универсальную настраиваемую автоматизацию вместо
отдельного экрана повторного контакта (re-engage). Исследование, план и
скриншоты лежат в
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md).

| ID    | Требование                                                                                                                      | Состояние                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-X1  | Найти все личные (1:1) контакты без сообщений в обе стороны не меньше N дней, по умолчанию 90.                                  | Готово: `findDormantContacts` в `js/src/crm/reengage.js` группирует сообщения по чатам, оставляет только личные чаты (`chatType` адаптера, диапазоны peer VK или ровно один другой участник), пропускает группы, каналы и ботов и по умолчанию пропускает чаты, где владелец ни разу не писал. Её использует условие `silentDays` автоматизации. Тесты: `js/tests/reengage.test.js`, `js/tests/automations.test.js`.               |
| R-X2  | Два текста из issue используются по умолчанию, и оба можно заменить.                                                            | Готово: это шаблоны пресета `reengage-dormant` (`defaultReengageTemplates`); у каждой автоматизации свои редактируемые неформальный и формальный тексты с `{name}`, `{days}` и `{network}`.                                                                                                                                                                                                                                        |
| R-X3  | Определять regex-правилами, чего в диалоге было больше — "ты" или "вы".                                                         | Готово: `js/src/crm/address-form.js` — учитывающие Unicode маркеры целых слов (местоимения, притяжательные местоимения, глагольные формы, повелительное наклонение, приветствия) для русского, а также 您/你 и आप/तुम; собственные сообщения владельца весят вдвое больше (2×); побеждает больший счёт. Тесты: `js/tests/address-form.test.js`.                                                                                    |
| R-X4  | Правила определения расширяемы.                                                                                                 | Готово: опция `rules`, а ссылки `pattern:*` с экрана Patterns с метками `address:informal` / `address:formal` становятся дополнительными правилами (`addressRulesFromPatterns`).                                                                                                                                                                                                                                                   |
| R-X5  | Определённая форма объяснима и имеет безопасное значение по умолчанию.                                                          | Готово: каждый черновик несёт форму и причину (`majority`/`tie`/`no-evidence`); если данных нет или их поровну, используется вежливый текст на "вы". Карточка черновика, предпросмотр и `automations review` показывают форму и позволяют её переключить.                                                                                                                                                                          |
| R-X6  | Безопасный (debug) режим по умолчанию: одно подготовленное сообщение за раз, отправка только после подтверждения пользователем. | Готово: автоматизация в режиме `safe` (по умолчанию) только ставит в очередь ссылки `automation-draft:*`; каждый черновик отправляется по одному — с карточки черновика в его чате или из `automations review`, а сервер отказывает в отправке черновика без `confirm: true`. Тесты: `js/tests/automation.test.js`, `js/tests/automations-server.test.js`.                                                                         |
| R-X7  | Outreach — настраиваемая автоматизация, а не отдельный экран или чат.                                                           | Готово: `js/src/automation/automations.js` — триггер → аудитория → условия → действие, по образцу триггеров konard/vk-bot; issue #31 — это пресет `reengage-dormant` рядом с поиском работы, поиском контрактов и ответным приветствием. Вкладка Автоматизация редактирует их, показывает предпросмотр и запускает (`js/src/web/automations-view.js`). Тесты: `js/tests/automations.test.js`, `js/tests/automations-view.test.js`. |
| R-X8  | Автоматизации запускаются вручную, по расписанию, по входящему сообщению или из меню чата.                                      | Готово: виды триггеров `manual`, `schedule` (`every: "1d"`), `incoming` (regex) и `chat-menu`; планировщик стартует вместе с сервером (`createAutomationScheduler`); в заголовке каждого чата есть меню Автоматизации с пунктами "Проверить в этом чате" (условия игнорируются) и "Запустить с условиями".                                                                                                                         |
| R-X9  | Те же автоматизации в терминале и по HTTP.                                                                                      | Готово: `meta-sovereign automations` с `list`, `plan <id>`, `run <id>`, `review`, `drafts`, `history`, `save` и `delete` (`js/src/cli/automation-commands.js`); `/api/automations`, `/api/automations/{plan,run,drafts,history}` и `/api/automations/drafts/{send,form,mark,skip}` (`js/src/server/routes-automations.js`). Тесты: `js/tests/automation-cli.test.js`, `js/tests/automations-server.test.js`.                       |
| R-X10 | Никому не пишут дважды случайно.                                                                                                | Готово: каждый запуск сохраняет запись `automation-run:<automation>:<source>:<chat>` (`sent`, `skipped` или `failed`), а каждый черновик в очереди — это ссылка `automation-draft:*`; условие `cooldownDays` и ожидающие черновики исключают такие чаты, а предпросмотр объясняет, почему каждый человек не вошёл.                                                                                                                 |
| R-X11 | Сообщение можно отправить вручную, когда ни один адаптер не может его отправить.                                                | Готово: `prefillLinkFor` даёт `mailto:` с заполненным текстом (RFC 6068), `tg://user?id=` и `https://vk.com/im?sel=`; кнопка "Открыть чат" на карточке черновика использует его, а "Я отправил(а) сам(а)" записывает отправку.                                                                                                                                                                                                     |
| R-X12 | Автоматизации можно запускать на людях, по которым есть поиск и перекрёстные ссылки.                                            | Готово: `js/src/crm/people.js` сводит сообщения и ссылки `person:`, `member:` и `list:` в одну запись на аккаунт в сети с перекрёстными ссылками `sameAs`; `/api/people` ищет по ним; вкладка Автоматизация выбирает людей, запускает на них автоматизацию или сохраняет их списком. Тесты: `js/tests/people.test.js`.                                                                                                             |
| R-X13 | Аудитории объединяют друзей, чаты, сообщества и списки через объединение, пересечение и разность.                               | Готово: `resolveAudience` и `parseAudienceSpec` в `js/src/crm/people.js` — спецификации вроде `friends:vk & chat:vk:2000000001 - list:blocked` сохраняются как ссылки `audience:*` и вычисляются с подсчётом; друзья VK, участники чатов и сообществ (и участники чатов Telegram, которых отдаёт Bot API) синхронизируются как ссылки `member:`. Тесты: `js/tests/people.test.js`.                                                 |
| R-X14 | Автодополнение по ссылкам между сообщением и ответом на него, по частоте, затем слово за словом из наших собственных сообщений. | Готово: `js/src/replies/reply-graph.js` строит рёбра "сообщение → ответ" по архиву и в реальном времени; `/api/suggest` отдаёт целые ответы без дубликатов на последнее входящее сообщение чата по числу использований, затем продолжения слово за словом из сообщений владельца; поле ввода показывает их как чипы (Tab берёт первый). Тесты: `js/tests/reply-graph.test.js`, `js/tests/reply-service.test.js`.                   |
| R-X15 | Использовать link-cli для быстрого поиска ответов.                                                                              | Готово: `js/src/replies/reply-store-clink.js` зеркалирует граф ответов в `clink --serve` (`MS_REPLY_CLINK=1`) и никогда не задерживает нажатие клавиши; стоимость поиска измерена в `experiments/clink-*.mjs`. Тесты: `js/tests/reply-store-clink.test.js`.                                                                                                                                                                        |
| R-X16 | Хранение, импорт и экспорт используют ассоциативный стек: текст Links Notation и бинарные doublets link-cli.                    | Готово: `js/src/storage/doublets-archive.js` пишет архив хранилища в формате link-cli, так что тот же файл импортируется в `clink`; `js/src/storage/lino-store.js` пишет одну запись Links Notation на строку. Тесты: `js/tests/doublets-archive.test.js`.                                                                                                                                                                         |
| R-X17 | Статус набора текста во всех мессенджерах — для людей и для автоматизаций.                                                      | Готово: VK `messages.setActivity` и события набора из long-poll, Telegram `sendChatAction`, индикаторы набора WhatsApp и web UI; ссылки `typing:*` истекают; заголовок чата показывает, кто печатает, включая автоматизацию, которая печатает за пользователя, а наш статус набора отправляется, пока пользователь печатает. Тесты: `js/tests/live-links.test.js`, `js/tests/chat-view.test.js`.                                   |
| R-X18 | Когда API не может отправить сообщение, отправлять через официальный web UI с помощью browser-commander.                        | Готово: `js/src/sources/browser-sender.js` — сначала API, затем vk.com, web.telegram.org или web.whatsapp.com под управлением browser-commander с настоящими событиями клавиш; если в UI не выполнен вход, результат — `login-required`. Тесты: `js/tests/browser-sender.test.js`.                                                                                                                                                 |
| R-X19 | Чат по умолчанию выглядит как t3.codes, есть вариант в стиле Telegram, на React.                                                | Готово: `js/src/web/chat-view.js` — боковая панель с поиском и группировкой по датам, колонка сообщений по центру, плавающее поле ввода; Настройки → Внешний вид переключает оформление (t3, Telegram, WhatsApp, Signal) в `js/src/web/appearance.js` и `app.css`. Тесты: `js/tests/chat-view.test.js`, `js/tests/appearance.test.js`.                                                                                             |
| R-X20 | Темы: как в системе, светлая, тёмная и авто.                                                                                    | Готово: `resolveTheme` следует ОС (`prefers-color-scheme`), фиксированному выбору или времени суток (светлая 07:00–19:00); кнопка в шапке по-прежнему переключает светлую/тёмную. Тесты: `js/tests/appearance.test.js`.                                                                                                                                                                                                            |
| R-X21 | Все зависимости обновлены до последних релизов.                                                                                 | Готово в commit `chore(deps)`: обновлены npm packages и GitHub Actions; исправления под ESLint 10 и jscpd 5.                                                                                                                                                                                                                                                                                                                       |

## Y. Поиск учётных данных Telegram и общие UI-соглашения

Эти требования пришли из указаний мейнтейнера при разработке поиска
«Найти сессии Telegram на этом компьютере» (Telegram → Ввести вручную).
Они записаны как долговременные соглашения, чтобы дальнейшая работа
применяла их везде, где они уместны, а не переоткрывала на каждом экране.
Каждое применяется **единообразно** на всех подходящих поверхностях приложения.

| ID    | Требование                                                                                                                                                                                                                                                                                                                                                                                                                                            | Состояние                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-Y1  | Поиск перечисляет только заведомо живые учётные данные: token или сессию, которую Telegram активно отвергает, отбрасываем; ту, что проверить нельзя (сеть/таймаут), оставляем с пометкой «не проверено».                                                                                                                                                                                                                                              | Готово: `verifyRecord`/`isDeadError` в `js/src/sources/auto-import/telegram-creds.js`; `scan` фильтрует `active !== false`.                                                                        |
| R-Y2  | Учётные данные дедуплицируются по аккаунту и сворачиваются в одну подключаемую запись на тип (вход по сессии, bot token, вход по телефону и паролю) — никогда по строке на файл.                                                                                                                                                                                                                                                                      | Готово: `dedupeRecords` + `groupRecords`/`mergeRecords`; тесты в `js/tests/telegram-creds.test.js`.                                                                                                |
| R-Y3  | Пользовательские аккаунты показываются раньше бот-аккаунтов.                                                                                                                                                                                                                                                                                                                                                                                          | Готово: `groupRecords` стабильно сортирует по типу аккаунта (user 0, bot 1); тест "user accounts are listed before bot accounts".                                                                  |
| R-Y4  | Каждое место, где найдены учётные данные, сохраняется; сначала показывается самый короткий путь, остальные раскрываются по переключателю "+N more" / "Show less".                                                                                                                                                                                                                                                                                     | Готово: `byLength` сортирует `wheres`; `WhereLine` в `js/src/web/connections/telegram-sessions.js` — раскрываемый список.                                                                          |
| R-Y5  | Маскированные подсказки показывают не более первых трёх и последних трёх символов token/сессии (короткие значения откатываются к маске только хвоста); сырые секреты никогда не покидают машину и не попадают в логи.                                                                                                                                                                                                                                 | Готово: `maskEnds`/`maskHint`; везде BigInt-safe JSON; значения не возвращаются в браузер и не логируются.                                                                                         |
| R-Y6  | Подключение учётных данных всегда даёт явную видимую обратную связь (метку "Connected") — успешный клик никогда не бывает «немым».                                                                                                                                                                                                                                                                                                                    | Готово: состояние `connected` в `useFinder`; запись заменяет свою кнопку бейджем "Connected" с галочкой.                                                                                           |
| R-Y7  | Состояния подтверждения ("confirmed with Telegram") отрисовываются как одна небольшая иконка-галочка, слова которой живут в её tooltip, через общий `VerifiedMark`, везде, где показана подтверждённая учётная запись. Tooltip — это стилизованный надёжный CSS-tooltip (`data-tooltip`, показывается при наведении и фокусе с клавиатуры), а не нативный `title` (медленный и его легко не заметить); `aria-label` сохраняет слова для скринридеров. | Готово: `VerifiedMark` + иконка `check` в `js/src/web/icons.js`; `[data-tooltip]` + `.verified-mark` в `app.css`.                                                                                  |
| R-Y8  | Постоянный хром (верхнее меню) всегда над временными оверлеями: кольцо подсветки обучения и его затемнение обрезаются по нижней кромке шапки и никогда не всплывают над верхним меню.                                                                                                                                                                                                                                                                 | Готово: `.topbar.glass` на `z-index: 2001`, выше оверлея обучения `z-index: 2000`; ни один шаг обучения не нацелен на элемент шапки.                                                               |
| R-Y9  | Подробные логи сервера включены по умолчанию в папке приложения и фиксируют каждый запрос и каждую ошибку со стеком, так что первопричина любого сбоя уже на диске.                                                                                                                                                                                                                                                                                   | Готово: `createServerLog`/`installCrashLogging` пишут `<store>/logs/meta-sovereign.log`; `--quiet-logs` отключает.                                                                                 |
| R-Y10 | Сгенерированные артефакты (например, `CHANGELOG.md`) исключены из гейта дублирования, чтобы автоматизация релизов его не роняла; гейт измеряет только написанный вручную код.                                                                                                                                                                                                                                                                         | Готово: `**/CHANGELOG.md` в `ignore` файла `.jscpd.json`.                                                                                                                                          |
| R-Y11 | Обучение реагирует на реальный прогресс: завершение подключения (сохранённая сессия, вход по телефону, токен бота или API-ключи) переводит тур дальше с шага «подключите сервис», как бы пользователь ни подключился — тур никогда не стоит на уже выполненном шаге.                                                                                                                                                                                  | Готово: пути подключения отправляют `meta-sovereign:connected` (`announceConnected`); `completeOnConnect` шага `setup` реагирует на него (`useCompleteOnConnect`); `TUTORIAL_VERSION` поднят до 4. |

## Traceability

Когда future PR или commit добавляет feature, reference matching `R-*` ID
в changeset и PR description, чтобы этот список оставался live spec.
