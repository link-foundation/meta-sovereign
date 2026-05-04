# Solution Plan

## Options Considered

### Option A: Retry or re-run the failed workflow

Rejected. The logs showed a real unresolved promise after the test
runner reported passing assertions. Re-running may hide a timing race,
but it does not fix it.

### Option B: Remove or relax the Windows Deno matrix job

Rejected. The Windows Deno job caught a bug in browser persistence
ordering. Removing that matrix cell would reduce coverage and allow the
bug to remain in the application.

### Option C: Increase timeouts

Rejected. The job did not hit the 10-minute job timeout. The failure
was an unresolved promise after the event loop emptied, not a slow test
that needed more time.

### Option D: Change the IndexedDB test shim only

Rejected as incomplete. The shim exposed a real ordering assumption:
transaction completion handlers should exist before the write request
can trigger or race completion.

### Option E: Attach transaction handlers before starting writes

Accepted. This fixes the root cause in `createIndexedDbDriver.save()`,
keeps the CI matrix intact, and makes the IndexedDB driver safer in any
fast completion ordering.

## Implementation

1. In `js/src/storage/browser-store.js`, create the transaction
   completion promise immediately after `db.transaction(...)`.
2. Assign `tx.oncomplete`, `tx.onabort`, and `tx.onerror` before
   calling `objectStore.put(...)`.
3. Await the request success and then await the transaction completion
   promise.
4. Add a regression test that asserts `tx.oncomplete` is attached
   before `put()` starts.
5. Add a patch changeset.
6. Preserve case-study data and template comparison artifacts in this
   directory.
7. Run focused and broad local checks.
8. Push PR #21, update the PR description, mark it ready, and inspect
   post-push CI runs.

## Verification Strategy

Focused checks:

- `deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests/browser-store.test.js`
- `node --test --test-timeout=30000 js/tests/browser-store.test.js`

Broad local checks before push:

- `npm run check`
- `npm test`
- `deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests`
- `bun test --timeout 30000`, when Bun is available locally
- `bash js/scripts/check-file-line-limits.sh`
- Documentation validation equivalent from `.github/workflows/release.yml`

Post-push verification:

- List recent workflow runs for `issue-20-2e1bcf090e36`.
- Confirm run timestamps and head SHA are newer than the pushed commit.
- Download logs for any non-passing runs into `docs/case-studies/issue-20/data`
  and analyze exact failures before final reporting.
