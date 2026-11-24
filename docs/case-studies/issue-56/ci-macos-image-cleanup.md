# Owned macOS image cleanup

The desktop run for source `138061146c0caeff01c64f29006a10d2071e90ca`
successfully verifies both built application bundles and the mounted DMG app.
Its [macOS job](https://github.com/link-foundation/meta-sovereign/actions/runs/44022664278/job/133835901747)
then fails during cleanup: preserved log lines 1164–1165 confirm the app's
signature, line 1166 reports `hdiutil: couldn't eject "disk7" - Resource busy`,
and line 1167 reports exit code 16. This is separate from the main workflow's
cancelled macOS runtime partition.

Move the existing macOS package checks into one executable script. Each
successfully attached read-only image has its own subshell and EXIT cleanup,
including when signature verification fails. Try normal detach at most three
times, with two one-second delays. If a background reader still holds that
image, make one forced detach attempt against exactly the owned mount point.
Keep the original verification failure and fail explicitly if cleanup remains
impossible. Bundle names, identifiers, signatures, both architectures, every
DMG and the update manifest remain checked.

Run the finite regression with:

```sh
node --test --test-concurrency=1 js/tests/desktop-dmg-cleanup.test.js
```

The test substitutes small command fixtures; it builds no application and
mounts no disk. All four cases fail with the exact previous workflow body
(`MACOS_SMOKE_PARENT=1`) and pass with the actual new script: transient busy
cleanup, cleanup after a verification failure, the bounded owned-image
fallback and permanent detach refusal. The final focused selection has 31
passing tests, including packaging, release admission and filtered checkout.
Shell syntax, scoped lint, formatting, secret scanning and the unchanged
duplication gate are verified separately in the evidence archive.

The [hashed archive](data/ci-macos-image-cleanup.tar.gz) retains the original
hosted log, exact parent workflow, finite fixtures, final source and check
results. Hosted macOS verification remains required. This CI correction
accepts no original issue criterion; all forty unchecked rows remain required
in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
