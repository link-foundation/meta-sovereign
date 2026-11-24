# Hosted EC2 archive preparation

Follow-up for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57)
and [the earlier Azure mirror correction](ci-browser-apt.md). Every unfinished
issue criterion remains required; this setup correction accepts none.

## Reproduction and cause

[Pages run 44192601083](https://github.com/link-foundation/meta-sovereign/actions/runs/44192601083)
was created on 2026-11-17 at 22:42:10 UTC for
`5e438e1b1413b6c724170bd05acfa1fe34a46179`. Its built-bundle job was cancelled
at its existing 15-minute deadline. The preserved annotation explicitly reports
maximum execution time, rather than a product assertion failure.

The complete 1,693-line log reports zero prepared sources at line 1335, loads
`apt-mirrors.txt` at line 1348, and downloads Ubuntu packages from
`us-east-2.ec2.archive.ubuntu.com` from line 1547. Line 1544 requests 139 MB;
line 1673 cancels dependency installation. Browser assertions never started.
The earlier helper recognizes Azure and the primary archive, so the observed
EC2 archive cannot participate in its priority adjustment.

The [versioned runner image script](https://github.com/actions/runner-images/blob/ubuntu26/20261111.196/images/ubuntu/scripts/build/configure-apt-sources.sh)
defines the mirror-list format and preserves source indirection across cloud
initialization. It still names Azure; it does not establish the exact contents
of this failed runner's runtime mirror file. The regression reconstructs that
format with the EC2 host observed in the actual download log and explicit
architecture metadata. It is not a downloaded copy of that file.
The [APT mirror transport manual](https://manpages.debian.org/unstable/apt/apt-transport-mirror.1.en.html)
specifies that lower numeric priorities are tried first and remaining mirrors
provide failover. Both references were checked on 2026-11-17.

## Correction and verification

The helper recognizes both Azure and regional EC2 archive hosts. In a mirror
list it exchanges the existing primary and preferred cloud priorities while
retaining the URLs and metadata. Active direct sources use the primary HTTPS
archive. Full hostname and path boundaries preserve lookalike domains, ports
and security archives. Existing suites, keys, repositories, workflow coverage
and job deadlines remain unchanged.

The new temporary-directory regression fails on the exact published helper:
expected two prepared files, received zero. Its five existing controls pass.
The corrected helper passes all six setup checks and twenty workflow contract
checks with one worker and a 256 MiB JavaScript heap. The new case checks both
mirror-list and direct-source forms, retained architecture metadata, unrelated
sources and idempotence. No host APT configuration or packages are changed
locally.

```sh
NODE_OPTIONS=--max-old-space-size=256 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-browser-apt.test.js js/tests/ci-contracts.test.js
```

Strict changed-code lint, formatting, secret scanning, source/document limits
and workflow policy pass. Duplication remains 6.49%, within the unchanged 6.5%
gate.
The [evidence archive](data/browser-apt-ec2.tar.gz) and
[manifest](data/browser-apt-ec2.tar.sha256.json) preserve the complete failure
log, timestamp/SHA/annotation records, runner source, parent helper and focused
checks. Hosted evidence must verify actual changed sources, primary package
downloads, browser assertions and the complete current-commit gate before this
correction is treated as verified on a runner. Recognizing the observed host
cannot guarantee archive performance on every future runner.
