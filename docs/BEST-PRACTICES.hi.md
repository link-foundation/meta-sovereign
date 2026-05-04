# AI-driven development के best practices (languages: [en](BEST-PRACTICES.md) • [zh](BEST-PRACTICES.zh.md) • hi • [ru](BEST-PRACTICES.ru.md))

यह document CI/CD practices बताता है जो AI-driven development workflows
की quality और reliability बढ़ाते हैं। सही configuration में AI solver
CI/CD feedback के साथ iterate करता है जब तक सभी checks pass न हों।

## AI development में CI/CD क्यों जरूरी है

Feedback loop:

1. AI issue requirements से solution बनाता है।
2. CI/CD automated quality checks चलाता है।
3. AI failures fix करके फिर iterate करता है।
4. सभी gates pass होने के बाद ही code merge होता है।

यह humans, AIs या mixed teams में consistent quality देता है।

## Template practices

### 1. File size limits

Code files maximum 1500 lines की होती हैं। इससे AI पूरे file को context
में पढ़ पाता है, humans navigation कर पाते हैं, और architecture modular
रहता है।

### 2. Automated formatting

ESLint quality/style rules देता है, Prettier formatting संभालता है, और
Husky pre-commit hooks चलाता है। Consistent format diff noise घटाता है।

### 3. Static analysis और linting

Strict ESLint, unused-variable checks और async/await rules review से पहले
bugs पकड़ते हैं।

### 4. Comprehensive testing

Tests Node.js, Bun, Deno और Ubuntu/macOS/Windows पर चलते हैं।
[`test-anywhere`](https://github.com/link-foundation/test-anywhere)
cross-runtime compatibility बनाए रखता है।

### 5. Changeset versioning

हर PR independent changeset file बनाता है। Highest bump type merge के समय
जीतता है, changelog अपने-आप बनता है, और `package.json` conflicts घटते हैं।

### 6. Pre-commit hooks

Local quality gates format, lint और file-size validation चलाते हैं ताकि
broken commits CI तक न पहुंचें।

### 7. Release automation

Release workflow version bump, changelog generation, OIDC trusted
publishing और GitHub Release automate करता है। Publish तभी होता है जब
checks pass हों।

### 8. CI/CD pipeline features

Workflow hive-mind practices अपनाता है: concurrency control, PR branch
queueing, main branch पर older run cancellation, fresh merge simulation और
fast-fail ordering।

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref == 'refs/heads/main' }}
```

### 9. Fast-fail ordering

Syntax, format, lint और file-line-limit पहले चलते हैं। Slow 3 runtime × 3
OS matrix तभी चलता है जब fast checks pass हों।

### 10. File line limits in CI

`scripts/check-file-line-limits.sh` `.mjs` scripts और release workflow को
भी 1500-line limit में रखता है।

### 11. Secrets detection

`secretlint` lint job में API tokens, passwords और private keys पकड़ता है।

### 12. Documentation validation

Docs बदलने पर CI docs line limits और required files जैसे `README.md`,
`CHANGELOG.md`, `docs/CONTRIBUTING.md` और `docs/BEST-PRACTICES.md` check
करता है।

### 13. Reasonable timeouts

हर CI job `timeout-minutes` declare करता है और test runners 30-second
per-test budget रखते हैं। Hung promise minutes में fail होता है, hours में
नहीं।

### 14. Cancellation propagation

Job conditions `always()` के बजाय `!cancelled()` use करते हैं ताकि
cancelled workflow में downstream jobs न चलें।

## Quality strategy

Template defense-in-depth उपयोग करता है: developer machine पर pre-commit
और local tests, CI में fast/slow checks, documentation validation,
changeset verify, और release केवल all checks pass होने पर।

## References

- [Code Architecture Principles](https://github.com/link-foundation/code-architecture-principles)
- [hive-mind CI/CD Best Practices](https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md)
- [hive-mind CI/CD Case Studies](https://github.com/link-assistant/hive-mind/tree/main/docs/case-studies)
