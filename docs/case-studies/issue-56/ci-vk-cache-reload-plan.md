# WebKit cache reload investigation

- Preserve the exact failing run, timestamps, head SHA and raw job logs before
  changing the cache UI or its browser assertions.
- Reproduce the single synthetic cache scenario with bounded request/response
  tracing. Determine the actual refusal before selecting a correction.
- Add a regression that fails on the parent and retains the 401-record reload
  assertion, offline cache reuse and zero provider writes.
- Run focused checks with limited concurrency. Use hosted CI for the full
  runtime/browser matrices and require all checks on the final commit.
- Keep VK24 and all other unmet requirements open until their evidence passes.

Observed run `43799402081` was created at `2026-11-16T03:38:32Z` for
`7973fe42bff797e7c48631b19421d51b2f2789e6`. WebKit shard 4 job
`133077189111` failed at `03:49:44Z`: raw log lines 778–787 show an undefined
`retained.cache` at `e2e-vk-cache.mjs:94`. The raw job log is preserved locally.
Its assertions passed before reload; the log does not expose the response that
caused the missing cache. The cause is still under investigation.
