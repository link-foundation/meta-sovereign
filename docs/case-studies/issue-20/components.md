# Components

## Application Code

### `js/src/storage/browser-store.js`

`createBrowserStore()` selects a browser persistence backend in this
order:

1. `doublets-web`, when available.
2. IndexedDB, when available.
3. `localStorage`, when available.
4. In-memory storage as a final fallback.

The failure was inside `createIndexedDbDriver().save()`. The old code
started a transaction, awaited `objectStore.put()`, then attached
transaction lifecycle handlers. That is unsafe because transaction
completion is a separate event from the request success event.

The fixed code creates the transaction-completion promise immediately
after `db.transaction(...)` and before `objectStore.put(...)` starts.

### `js/tests/browser-store.test.js`

The existing IndexedDB shim test proved the driver worked in common
timer orderings, but it did not assert that completion handlers were
installed before writes began. The new test models the ordering
contract directly:

- The fake `put()` records whether `tx.oncomplete` is already set.
- The store performs `put()` and `flush()`.
- The test asserts that the completion handler existed before `put()`
  started.

This makes the failure mode reproducible without needing a Windows
runner.

## CI/CD

### `.github/workflows/release.yml`

The failing job was `Test (deno on windows-latest)`. The workflow is
already designed to expose this class of issue:

- Node, Bun, and Deno runtime matrix.
- Ubuntu, macOS, and Windows OS matrix.
- `fail-fast: false` so one matrix failure does not cancel evidence
  from the remaining matrix jobs.
- `timeout-minutes: 10` on tests to surface hangs.
- Fresh-merge simulation for PR test jobs.
- Separate fast checks for syntax, lint/format, changesets, and file
  line limits.

The evidence does not support changing this workflow as the primary
fix. The workflow correctly caught an async ordering bug.

### `.github/workflows/links.yml`

The link-checker workflow matches the JavaScript template pattern,
including lychee, cache usage, a timeout, case-study exclusion, and a
Wayback fallback check. It was not involved in the failure.

### `.github/workflows/pages.yml`

This workflow is product-specific for GitHub Pages publishing and does
not exist in the generic templates. It was not involved in the failure.

## Templates

The linked templates were cloned and captured under `templates/`.
Relevant files:

- `templates/js/.github/workflows/release.yml`
- `templates/js/.github/workflows/links.yml`
- `templates/rust/.github/workflows/release.yml`
- `templates/python/.github/workflows/release.yml`
- `templates/csharp/.github/workflows/release.yml`
- `templates/diffs/js-template-release-vs-meta-sovereign-release.diff`
- `templates/diffs/js-template-links-vs-meta-sovereign-links.diff`

No linked template contains `browser-store.js`, the IndexedDB driver,
or the browser-store tests. No upstream template issue is needed for
this specific root cause.
