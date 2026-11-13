# Preserve the current native CLI during parent regressions

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
On head `9db8d8d97da8551b381e7655107904e07afda7d8`, the
[Rust job](https://github.com/link-foundation/meta-sovereign/actions/runs/43499087242/job/132142558257)
passes workspace tests, including all three official-codec durable integration
cases. Its complete 1,025-line log then records the expected exact-parent
restart failure (`404 !== 200`, lines 930–943), a current build completing in
0.00 seconds (945), and the following network test launching the parent's CLI:
`unknown argument: --memory` (960).

The parent regression shared the current Cargo target directory to reuse
dependencies. Its build replaced the final CLI pathname; the subsequent cached
current build did not restore that pathname on this runner. The probe now saves
the current executable, removes the shared final pathname before the reference
build, copies the parent executable to its own temporary directory and restores
the current executable in `finally`, including on build failure. It runs the
reference test against that separate parent copy. Dependency artifacts and
source history are preserved.

Run `python3 -B experiments/issue-56/native-cargo-reference-check.py`. Two tiny,
dependency-free Cargo packages reproduce the shared pathname overwrite and
verify both actual executable identities after isolation, a subsequent current
build and restoration after a deliberately failed reference build. Local Cargo
1.99.0 does restore the executable during an ordinary current rebuild; the
hosted 1.99.1 cached failure above is the evidence for that additional behavior.
The finite local check does not claim to reproduce the full hosted cache state.

The same run's
[API Docs job](https://github.com/link-foundation/meta-sovereign/actions/runs/43499087242/job/132142558414)
fails on the CLI's usage documentation: `<dir>` is parsed as an unclosed HTML
tag (full log lines 584–594). The command is now inline code. The focused check
passes the actual CLI documentation header to rustdoc with `-D warnings`:
the original header fails for that exact tag and the corrected header passes.
No warning gate is weakened. Both checks are registered in the hosted Rust job.

The [evidence archive](data/ci-native-reference-artifact.tar.gz) and
[manifest](data/ci-native-reference-artifact.tar.sha256.json) retain both full
hosted job logs, exact-head metadata, sources and local checks. The actual
corrected native network/restart check still requires hosted verification.
Native reconciliation and all remaining issue acceptance criteria stay open.
