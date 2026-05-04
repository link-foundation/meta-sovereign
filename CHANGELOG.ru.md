# Журнал изменений (languages: [en](CHANGELOG.md) • [zh](CHANGELOG.zh.md) • [hi](CHANGELOG.hi.md) • ru)

Это русская версия истории релизов. Номера версий, commit hash, имена
команд и API оставлены в исходном виде, чтобы их можно было сверять с
npm, GitHub Releases и английским
[`CHANGELOG.md`](./CHANGELOG.md).

## 0.13.0

### Minor Changes

- R-N1..R-N10: email стал полноценным источником данных: импорт
  `.eml`/mbox, получение и отправка через Gmail, Microsoft Graph и JMAP
  прямо из браузера, Node local-server transport для IMAP/POP3/SMTP,
  HTTP-маршруты email, CLI-команды, текст connection guide и case study
  для issue #3. Чистый Rust-сервер теперь повторяет тот же wire surface:
  `email` есть в `/sources`, а `/api/email/pull` и `/api/email/send`
  принимают одинаковые JSON envelopes для импорта архивов и очереди
  отправки.

## 0.12.0

### Minor Changes

- R-M1..R-M18: все пустые разделы SPA заменены connection guide,
  добавлен CORS-aware direct API probe с same-origin fallback, а также
  пошаговый tutorial overlay.
- R-N1..R-N9: текущий шаг и состояние завершения tutorial сохраняются в
  `metaSovereignTutorial`, поэтому после refresh пользователь
  продолжает с текущего шага.

## 0.11.0

### Minor Changes

- R-L1..R-L15: функции, которые могут работать прямо в браузере,
  опубликованы на GitHub Pages, пользовательская документация
  переписана, CI/CD parity audit завершен.
- Добавлены `docs/USER-GUIDE.md`, `docs/SERVER-PARITY.md` и case study
  для issue #8; JavaScript code/tooling перенесены в `js/`, Rust
  workspace остался отдельным.

## 0.10.0 и раньше

Ранние релизы заложили local-first основу: dual storage, импорт/экспорт
`.lino`, encrypted backups, soft delete, публикацию на GitHub Pages,
WebRTC/WebSocket sync, React SPA, Electron/Capacitor shells, pure-Rust
server и cross-runtime test matrix. Полная generated history находится
в английском [`CHANGELOG.md`](./CHANGELOG.md); локализованная версия
оставляет пользовательский обзор и не дублирует каждую внутреннюю
запись release log.
