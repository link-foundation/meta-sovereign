# Contributing to meta-sovereign (languages: [en](CONTRIBUTING.md) • [zh](CONTRIBUTING.zh.md) • [hi](CONTRIBUTING.hi.md) • ru)

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
bun test
npm test
deno test --allow-read
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

## Questions?

Если есть вопросы о contribution process, откройте issue для discussion.
