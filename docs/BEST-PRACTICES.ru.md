# Best Practices for AI-Driven Development (languages: [en](BEST-PRACTICES.md) • [zh](BEST-PRACTICES.zh.md) • [hi](BEST-PRACTICES.hi.md) • ru)

Документ описывает CI/CD practices, которые повышают качество и
надежность AI-driven development workflows. При правильной настройке AI
solver вынужден iteratively исправлять failures, пока все checks не
пройдут.

## Почему CI/CD важно для AI development

Feedback loop:

1. AI создает solution по issue requirements.
2. CI/CD валидирует code quality.
3. AI исправляет failures, пока все checks не проходят.
4. Code merge возможен только после всех gates.

Такой подход дает consistent quality для human, AI или mixed teams.

## Practices in this template

### 1. File size limits

Code files ограничены 1500 lines. AI может прочитать весь file в context
window, humans проще navigates, а architecture остается modular.

### 2. Automated formatting

ESLint отвечает за quality/style rules, Prettier - за formatting, Husky -
за pre-commit hooks. Consistent format уменьшает diff noise.

### 3. Static analysis and linting

Strict ESLint, unused-variable checks и async/await rules ловят bugs до
review.

### 4. Comprehensive testing

Tests запускаются на Node.js, Bun, Deno и Ubuntu/macOS/Windows.
[`test-anywhere`](https://github.com/link-foundation/test-anywhere)
сохраняет cross-runtime compatibility.

### 5. Changeset-based versioning

Каждый PR создает independent changeset. Highest bump type wins при
merge, changelog генерируется автоматически, а `package.json` conflicts
уменьшаются.

### 6. Pre-commit hooks

Local quality gates запускают format, lint и file-size validation до CI.

### 7. Release automation

Release workflow автоматически делает version bump, changelog generation,
OIDC trusted publishing и GitHub Release. Publish идет только после
validated checks.

### 8. CI/CD pipeline features

Workflow следует hive-mind practices: concurrency control, PR branch
queueing, cancellation старых runs на main, fresh merge simulation и
fast-fail ordering.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref == 'refs/heads/main' }}
```

### 9. Fast-fail ordering

Syntax, format, lint и file-line-limit запускаются раньше slow 3 runtime ×
3 OS matrix.

### 10. File line limits in CI

`scripts/check-file-line-limits.sh` проверяет `.mjs` scripts и release
workflow, чтобы workflow не разрастался.

### 11. Secrets detection

`secretlint` в lint job ловит API tokens, passwords и private keys.

### 12. Documentation validation

При docs changes CI проверяет docs line limits и required files:
`README.md`, `CHANGELOG.md`, `docs/CONTRIBUTING.md`,
`docs/BEST-PRACTICES.md` и другие.

### 13. Reasonable timeouts

Каждый CI job объявляет `timeout-minutes`, а test runners используют
30-second per-test budget. Hung promise fails за minutes, а не за hours.

### 14. Proper cancellation propagation

Job conditions используют `!cancelled()` вместо `always()`, чтобы
cancelled workflow не запускал downstream jobs.

## Quality strategy

Template использует defense-in-depth: pre-commit и local tests на
developer machine, fast/slow checks в CI, documentation validation,
changeset verify и release только после all checks pass.

## References

- [Code Architecture Principles](https://github.com/link-foundation/code-architecture-principles)
- [hive-mind CI/CD Best Practices](https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md)
- [hive-mind CI/CD Case Studies](https://github.com/link-assistant/hive-mind/tree/main/docs/case-studies)
