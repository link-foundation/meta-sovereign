# Retain the CI deadline with a filtered checkout

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) still requires
passing exact-head hosted checks and every unchecked issue criterion.

- [x] Preserve the current macOS cancellation log, verify its SHA/timestamps and
      identify checkout/setup time separately from test runtime.
- [x] Read the pinned checkout action's supported partial-clone input.
- [x] Keep full commit history and every runtime/OS shard while avoiding download
      of unused historical blobs in runtime test jobs.
- [x] Verify an exact-parent workflow regression and a finite filtered Git
      fixture with a fresh-base merge and lazy historical blob access.
- [ ] Run focused CI configuration checks, archive evidence, commit and push.
- [ ] Review all workflows for the resulting commit; continue all unmet issue
      requirements without treating a checkout change as feature acceptance.
