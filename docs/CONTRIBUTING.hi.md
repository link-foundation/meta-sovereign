# meta-sovereign में योगदान (languages: [en](CONTRIBUTING.md) • [zh](CONTRIBUTING.zh.md) • hi • [ru](CONTRIBUTING.ru.md))

## Development Workflow

1. Repository fork करें और अपना fork clone करें।
2. Feature branch बनाएं: `git checkout -b feature/my-feature`।
3. Dependencies install करें: `bun install` या `npm install`।
4. Changes करें।
5. Local checks चलाएं: `bun run check`।
6. Changeset बनाएं: `bun run changeset`।
7. Commit और push करें; pre-commit hooks अपने-आप चलेंगे।
8. Pull Request बनाएं।

## Code Standards

### File Size Limits

हर file अधिकतम **1500 lines** होनी चाहिए। यह ESLint `max-lines` rule और CI
`check-file-line-limits` job से enforce होता है। इससे AI और human
developers files को एक context में पढ़ पाते हैं और modules maintainable
रहते हैं।

### Formatting और Linting

सभी code को pass करना होगा:

```bash
bun run format:check
bun run lint
bun run check
```

Manual fix:

```bash
bun run format
bun run lint:fix
```

### Testing Requirements

Tests critical paths cover करें, Node.js/Bun/Deno पर चलें, और
[`test-anywhere`](https://github.com/link-foundation/test-anywhere)
style से cross-runtime compatible रहें।

```bash
bun test
npm test
deno test --allow-read
```

## Changesets से Version Management

Project [Changesets](https://github.com/changesets/changesets) से
versions और changelog manage करता है, ताकि multiple PRs `package.json`
version bump करके conflict न बनाएं।

Users को affect करने वाले changes के लिए changeset add करें:

```bash
bun run changeset
npm run changeset
```

| Type      | कब उपयोग करें             | Examples                    |
| --------- | ------------------------- | --------------------------- |
| **Patch** | Bug fix या internal work  | typo, dependency, refactor  |
| **Minor** | New feature, non-breaking | new function, optional arg  |
| **Major** | Breaking change           | remove function, change API |

सिर्फ `./docs` या Markdown changes को usually changeset नहीं चाहिए, जब तक
वे user-visible code behavior के साथ न हों।

## Pull Request

PR title clear होना चाहिए:

```text
feat: Add support for custom configuration
fix: Resolve race condition in async handler
docs: Update API documentation for v2
```

PR description में What, Why और Testing शामिल करें। सभी PRs syntax
check, format, ESLint, secrets scan, file line limits, changeset
validation, docs validation, और cross-platform/cross-runtime test matrix
pass करें।

CI latest `main` को PR branch में merge करके merged state पर checks
चलाता है। Conflict हो तो:

```bash
git fetch origin main
git merge origin/main
# resolve conflicts
git push
```

## Questions?

Contribution process पर सवाल हो तो discussion के लिए issue खोलें।
