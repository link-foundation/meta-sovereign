# Windows résumé export assertions

Export head `9e2169f31b843d06b877601d1c882f64dd51288f`, created
2026-11-12 06:53:24 UTC, failed Checks run
[43171285138](https://github.com/link-foundation/meta-sovereign/actions/runs/43171285138).
The preserved full log and run metadata are in
[the evidence archive](data/ci-resume-permissions.tar.gz).

The Windows Node job reports `438 !== 384` for the file and `438 !== 448`
for the directory at full-log lines 61481–61512. Decimal 438 is octal 0666;
the expected values are POSIX 0600 and 0700. Windows Bun independently
reports the same two errors at lines 105071–105100. These are the only two
Windows Node test failures (5,119 passed, four skipped).

The assertions incorrectly treated Windows mode bits as POSIX permissions.
Node documents that Windows does not implement the owner/group/other
distinction in these APIs. See
[the official file mode caveat](https://nodejs.org/api/fs.html#fschmodpath-mode-callback).
The two mode assertions now apply on POSIX platforms, matching existing
backup tests. Every manifest, digest, exact-size, traversal, private HTTP
attachment, CLI completion and copy-content assertion still runs on Windows.
Production creation modes, paths, validation and cleanup are unchanged.
This correction does not verify Windows ACL isolation; inherited account
directory ACLs remain outside this POSIX-bit test's evidence.

The focused four-test file passes locally, including actual POSIX 0600/0700
checks. Hosted Windows Node/Bun/Deno verification is still required for the
next commit; a Linux run cannot establish their result.

The same run's macOS shard 1 failed before tests: `git fetch` could not
connect to github.com:443, exit 128 (full-log lines 34901–34903).
Other cancelled jobs are not passing evidence. No network workaround or
test deadline change is inferred from this separate infrastructure failure.
