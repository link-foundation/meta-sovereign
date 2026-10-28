# Contributing to meta-sovereign (languages: [en](CONTRIBUTING.md) • [zh](CONTRIBUTING.zh.md) • [hi](CONTRIBUTING.hi.md) • ru)

Локально запускайте только конкретные тесты изменённых компонентов. Полный набор тестов, нагрузочные проверки и матрицы сред выполняются в GitHub CI/CD после push. Не запускайте полный `npm test` или `bun test` на рабочем компьютере.

## Development Workflow

1. Fork repository и clone вашего fork.
2. Создайте feature branch: `git checkout -b feature/my-feature`.
3. Установите dependencies: `bun install` или `npm install`.
4. Внесите изменения.
5. Запустите local checks: `bun run check`.
6. Создайте changeset: `bun run changeset`.
7. Commit и push; pre-commit hooks запустятся автоматически.
8. Создайте Pull Request.

## Code Standards

### File Size Limits

Максимум **1500 lines** на file. Ограничение enforced через ESLint
`max-lines` и CI job `check-file-line-limits`. Это помогает AI и human
developers читать file в одном context window и поддерживать модульную
архитектуру.

### Formatting and Linting

Весь code должен проходить:

```bash
bun run format:check
bun run lint
bun run check
```

Ручное исправление:

```bash
bun run format
bun run lint:fix
```

### Testing Requirements

Tests должны покрывать critical paths, работать на Node.js/Bun/Deno и
использовать
[`test-anywhere`](https://github.com/link-foundation/test-anywhere) для
cross-runtime compatibility.

```bash
# Local: specific test files only
node --test --test-concurrency=1 js/tests/rolling-host.test.js
# Full suite: GitHub CI/CD after push
```

## Version Management with Changesets

Project использует [Changesets](https://github.com/changesets/changesets)
для versions и changelog, чтобы multiple PRs не конфликтовали при bump
`package.json`.

Для user-visible changes добавьте changeset:

```bash
bun run changeset
npm run changeset
```

| Type      | When to use               | Examples                   |
| --------- | ------------------------- | -------------------------- |
| **Patch** | Bug fixes, internal work  | typo, dependency, refactor |
| **Minor** | New non-breaking features | new function, optional arg |
| **Major** | Breaking changes          | remove function, API shape |

Документация в `./docs` и Markdown-only changes обычно не требуют
changeset, если не сопровождаются user-visible code behavior.

## Pull Request

PR title должен ясно описывать изменение:

```text
feat: Add support for custom configuration
fix: Resolve race condition in async handler
docs: Update API documentation for v2
```

PR description должна включать What, Why и Testing. Все PRs должны
проходить syntax check, formatting, ESLint, secrets scan, file line
limits, changeset validation, docs validation и cross-platform /
cross-runtime test matrix.

CI автоматически merge latest `main` в PR branch и запускает checks на
merged state. Если есть conflicts:

```bash
git fetch origin main
git merge origin/main
# resolve conflicts
git push
```

<a id="working-rules"></a>

## Правила работы

Они относятся к каждому изменению — и людей, и ИИ-агентов; с этого раздела начинает любой агент (отдельных файлов для агентов в репозитории нет). Каждое пришло из указания мейнтейнера; продуктовые требования, которые они защищают, — в [REQUIREMENTS.ru.md](REQUIREMENTS.ru.md).

1. **Каждое изменение — коммит и push.** Когда проверки проходят, коммит и push в `main`; если `main` ушёл вперёд, сначала rebase на него. В changeset указываются ID требований, которым служит изменение.
2. **Каждое требование отслеживается.** Новое указание становится строкой в [REQUIREMENTS.ru.md](REQUIREMENTS.ru.md) с ID и статусом на всех четырёх языках; то, что ещё открыто, названо в статусе, а не опущено.
3. **Документация на четырёх языках.** Каждая страница `docs/*.md` есть на английском, русском, хинди и китайском с языковым заголовком; разборы случаев в `docs/case-studies/` — только на английском.
4. **Секреты не покидают машину.** Строки сессий, токены, пароли и ключи никогда не выводятся, не пишутся в логи, не коммитятся и никуда не отправляются; маскированные подсказки показывают не больше трёх первых и трёх последних символов (R-Y5).
5. **В тестах и проверках — только заглушки.** Тесты и проверки никогда не обращаются к настоящим сетям, не читают настоящие профили браузеров и хранилища учётных данных, не сканируют машину пользователя и не отправляют с настоящего аккаунта; они подставляют заглушки (`clientFactory`, `telegramMtproto`, хранилища в памяти, временные папки) и не трогают настоящую папку приложения.
6. **Работающее приложение смотрим по счётчикам, а не по содержимому.** Работающий сервер проверяется по статусу (`/api/telegram/status`) и числу строк в логе; сообщения, контакты и учётные данные пользователя при отладке не выводятся.
7. **Каждую сеть спрашиваем один раз.** Сначала хранилище, у сети — только недостающее, через очередь приоритетов аккаунта (R-Y24, R-Y25); всё, что сеть сообщила, сохраняется (R-Y28).
8. **Чужой код — справочник, а не зависимость.** Открытые клиенты, у которых мы учимся, перечислены в [CHAT-REFERENCES.ru.md](CHAT-REFERENCES.ru.md); скачанные копии только читаются — никогда не собираются, не устанавливаются и не запускаются.
9. **Проверки качества остаются включены.** Локально проверяйте изменённые файлы и конкретные тесты. Полные проверки и тесты выполняются в GitHub CI/CD после push, а не на компьютере пользователя. Функции сверх лимитов разбиваются; после изменений веб-приложения пересобирайте `js/src/web/app.min.js` (`npm run build:web`).
10. **Локальное приложение для своего пользователя.** meta-sovereign — открытое приложение, работающее на машине пользователя, с его собственными аккаунтами и для его удобства: оно действует только тогда и так, как просит пользователь, в темпе, который допускает каждая сеть.
11. **Браузеры — через browser-commander и без полос об автоматизации.** Браузер, который открывает приложение, и браузер для просмотра веб-приложения при проверке изменения запускаются [browser-commander](https://github.com/link-foundation/browser-commander) с запуском по умолчанию (установленный Chrome так, как его запускает человек): никогда с ключом, из-за которого Chrome показывает полосу «управляется автоматизированным ПО» или «неподдерживаемый флаг командной строки» (`--enable-automation`, `--disable-blink-features=AutomationControlled`). О такой полосе в самом browser-commander сообщается в его репозиторий.
12. **Изменение формы данных поставляется с миграцией.** Если изменение меняет способ хранения чего-либо (поле, идентификатор, формат даты), добавьте пронумерованный модуль миграции в `js/src/storage/migrations/` и поднимите `CURRENT_SCHEMA` (R-Z17): идемпотентный, без сети, с тестом на хранилище в старой форме, тестом идемпотентности, подсчётом при dry-run и строкой в [DATA-MIGRATIONS.ru.md](DATA-MIGRATIONS.ru.md). Тест-страж реестра падает, если чего-то не хватает.

## Questions?

Если есть вопросы о contribution process, откройте issue для discussion.
