# Exact-head CI after fixture, history and reader corrections

All five workflows for commit `862af4baf37dd00c784c6b48dc0af5e03d5289b8`, created at 2026-11-09 19:17:16 UTC, completed successfully:

- [Checks and release](https://github.com/link-foundation/meta-sovereign/actions/runs/42681891883): all ten runtime jobs, Chromium, WebKit, native Rust, macOS/Linux helper checks, packed installation, large backup/restore and required gates pass. Release publication jobs are intentionally skipped on this draft PR.
- [Scheduled security audit](https://github.com/link-foundation/meta-sovereign/actions/runs/42681891925): all four CodeQL languages, including Python, and the aggregate gate pass.
- [Desktop release](https://github.com/link-foundation/meta-sovereign/actions/runs/42681891846), [Pages](https://github.com/link-foundation/meta-sovereign/actions/runs/42681891681) and [links](https://github.com/link-foundation/meta-sovereign/actions/runs/42681891838) pass.

This verifies the corrected restore/snapshot fixtures, Windows reader cleanup and WebKit Operator history behavior on that exact revision. The preceding missing Python job was an abandoned platform run; the required language and aggregate gates were preserved. No deadline increase or check bypass was used. The earlier nonpassing logs remain in [ci-9b718.md](ci-9b718.md).

Collected workflow results and detailed checks/security job metadata are preserved with verified hashes in `data/ci-862af4ba.tar.gz`. These results do not verify later commits or complete the still-open issue-wide requirements in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
