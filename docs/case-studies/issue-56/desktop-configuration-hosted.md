# Hosted desktop configuration verification

The desktop workflow for `3a24c7a51da9225e58b02c644a25c111c7e60834`
started at 2026-11-15 22:23:47 UTC. Its resolve job and all five platform build
jobs pass; publication is skipped for this draft PR. The retained API response
records individual job and step timestamps rather than inferring success from
an earlier commit.

[Linux x64 job 132981045270](https://github.com/link-foundation/meta-sovereign/actions/runs/43769059455/job/132981045270)
uses Electron 45.3.2 (log line 300). Its real native fixture reports
`nativeDesktopTls`, `ownedCertificateRequired` and
`certificateListenerReleased` as true at line 343, together with native
clipboard readback, foreign-navigation refusal and token-window isolation.
The expected `ERR_CERT_AUTHORITY_INVALID` lines retain the mismatched/foreign
certificate refusals; they do not indicate failed native acceptance.

Lines 347–365 start actual packaging and install 111 production runtime
packages. The build awaits staged dependency realpath/import validation before
Electron Builder, then passes the target smoke test and artifact upload. This
establishes the hosted dependency boundary for that commit; it does not claim
an authenticated provider session or interactive smoke tests on every platform.

This follows the initially pending gates in
[the implementation evidence](desktop-configuration.md). Its original archive
is preserved unchanged. The broader main workflow still has a macOS CLI startup
failure, documented in [the hashing investigation](rolling-digest.md). Full
current-head acceptance, shared editing and actual local/SSH execution remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/desktop-configuration-hosted.tar.gz),
[hash manifest](data/desktop-configuration-hosted.tar.sha256.json).
