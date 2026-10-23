# Дорожная карта (languages: [en](ROADMAP.md) • [zh](ROADMAP.zh.md) • [hi](ROADMAP.hi.md) • ru)

## Нет открытых отслеживаемых пунктов

Roadmap для issue #1 сейчас пуст. Каждое требование из исходного issue и
follow-up комментариев PR #2 занесено в
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md), и каждая строка помечена
Done с implementation evidence.

Файл остается reviewer-facing roadmap ledger, который был запрошен в PR
#2. Если во время review найден новый gap, добавьте его сюда с matching
requirement ID перед тем, как помечать соответствующее требование Done.

Какие функции клиента Telegram поддерживаются, поддерживаются частично, в
парковке или не поддерживаются, учтено в [`docs/FEATURES.ru.md`](./FEATURES.ru.md).

## Доработки по итогам аудита (R-Z)

Аудит готовой работы нашёл пробелы. Они сгруппированы в две волны. Волна 1 **в работе**, не закончена. Волна 2 **запланирована, не начата**. Ничего здесь не обещание и не срок.

### Волна 1 — в работе

- R-Z1: укрепить локальный server.
- R-Z2 (сделано): сделать безопаснее хранилище, backups, сохранённые секреты и логи.
- R-Z3 (сделано): сделать безопаснее автоматическую отправку.
- R-Z4 (сделано): сделать результаты отправки и sync честными (никаких случайных публичных постов в LinkedIn, никакого ложного успеха CV sync, личные сообщения X, понятные fallback).
- R-Z5: исправить email.
- R-Z6: зелёный CI (Deno, Bun, Windows, `cargo test`, browser e2e в CI).

### Волна 2 — запланировано, не сейчас

- R-Z7: подключить код, который есть, но не запускается: автоматическое расписание backups, tombstones удалённых сообщений (просмотр, восстановление, очистка), sync состава аудиторий, 24-часовая очистка кэша Upwork и PeoplePerHour, кнопка Skip в tutorial и refresh tokens, которые хранятся, но не используются.
- R-Z8: загрузка входящих для GitHub, Upwork и PeoplePerHour (email — в R-Z5), доработка VK live: обновления, постраничная история, media, реакции.
- R-Z9: личный WhatsApp: видимое окно входа (QR) для WhatsApp Web, стабильные id чатов, лучший парсер архивов, уведомление об условиях использования.
- R-Z10: импорт архивов Facebook, Instagram, X и LinkedIn: исправить совпадающие id, искажённый текст, потерянные вложения, реакции и участников.
- R-Z11: GitHub: редактирование, удаление и реакции на сообщения, review comments, уведомления, инкрементальная загрузка, discussions, список репозиториев.
- R-Z12: единообразие страниц: Escape и фокус в 16 диалогах, показ ошибок, которые сейчас проглатываются, исправление browser-теста credentials.
- R-Z13 (сделано): документация: матрицы возможностей по системам на четырёх языках, недостающие разделы R, S и T в requirements ru, hi и zh, дублирующиеся id R-N, утверждение про npm в README, этот roadmap, `MS_SECRET_PASSPHRASE` и честные ограничения Rust server.

### Не делаем сейчас

- Публикация пакета в npm (нужен владелец).
- Проверка web selectors на реальных аккаунтах (нужны реальные аккаунты).
- Разблокировка через WebAuthn и TOTP.
- Паритет Rust server с JS server: только документирован, см. [`docs/SERVER-PARITY.ru.md`](./SERVER-PARITY.ru.md).

## Закрытый scope

История закрытого implementation scope сохранена в
[`docs/case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md).
Финальное состояние PR #2 покрывает local-first dual storage, импорт и
экспорт `.lino`, encrypted backups, connectors, React SPA, browser
storage, server autodiscovery, WebSocket/WebRTC sync, Electron, mobile
packaging, Docker deployment, pure-Rust server parity и
unit/integration/Rust/browser e2e coverage.
