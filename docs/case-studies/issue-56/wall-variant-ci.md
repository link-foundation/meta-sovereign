# Reviewed wall invitation assertion

PR #57 remains draft and unmerged. This correction addresses one test assumption;
all 60 unchecked inventory rows remain required.

The exact-head run [43749062273](https://github.com/link-foundation/meta-sovereign/actions/runs/43749062273)
started on 2026-11-15 at 18:51:04 UTC for commit
`7205a3c0c7e853a9028274721d6fb285a8ceaefb`. Eight completed runtime jobs failed
the same assertion in `js/tests/vk-wall-interfaces.test.js:40`: the selected
invitation was compared with the complete multiline default catalog. Planning
correctly selects one saved variant, then execution uses that reviewed text.

The assertion now requires membership in the saved variants. It still rejects a
combined catalog or text outside the owner's policy. Existing tests retain
trusted-origin admission, explicit confirmation, failed-save retention and the
native post/delete sequence; production behavior is unchanged.

The archived Node Ubuntu log records the mismatch at lines 7656–7681; Bun Windows
at 12147–12183; Deno Windows at 5901–5918. All eight logs and exact-head job/run
metadata are retained. The previous getter failure is absent from these jobs;
this does not establish that unfinished browser jobs passed.

Reproduce the exact-parent assertion with
`python3 -B experiments/issue-56/wall-variants-before.py`. It must fail its real
equality assertion, and restores the test file afterward. The corrected interface
and default-catalog tests pass seven cases each in Node, Bun and Deno. No full
local suite or authenticated provider work was run. Hosted checks for the next
commit remain required.

The [evidence archive](data/wall-variant-ci.tar.gz) and its
[SHA-256 manifest](data/wall-variant-ci.tar.sha256.json) preserve those sources,
logs and reproduction. Regenerate with
`python3 -B experiments/issue-56/collect-wall-variant-ci.py`.
