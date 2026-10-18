# Working on meta-sovereign

Read these before changing anything; they apply to every change:

- [docs/CONTRIBUTING.md → Working rules](docs/CONTRIBUTING.md#working-rules) —
  how to work on the code: commit and push every change, track every
  requirement, docs in four languages, secrets never shown or logged,
  fakes only in tests, a running app looked at by counts not contents,
  each network asked once, third-party code read but never run, quality
  gates on, browsers through browser-commander with no automation bars.
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — the product
  requirements with their IDs and status. A new directive from the
  maintainer becomes a row there (in en, ru, hi and zh); name the IDs a
  change serves in its changeset (`.changeset/*.md`).
- [docs/BEST-PRACTICES.md](docs/BEST-PRACTICES.md) and
  [docs/CHAT-REFERENCES.md](docs/CHAT-REFERENCES.md) — conventions, and
  the open-source clients we compare our chat with.

Checks before a commit, from the repository root:

```bash
npm run build:web   # after any change under js/src/web
npm run check       # ESLint (no warnings), Prettier, duplication
npm test
```
